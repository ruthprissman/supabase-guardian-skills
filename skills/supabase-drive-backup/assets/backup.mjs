// Daily Supabase → Google Drive backup.
//
// Produces two artifacts, ENCRYPTS both, and uploads them to a Google Drive folder:
//   1. <prefix>_<date>.xlsx.enc    — one worksheet per public table (human-readable)
//   2. <prefix>_<date>.sql.gz.enc  — SQL INSERT dump (data only, no schema: restorable into
//                                     existing, empty tables)
//
// Encryption is MANDATORY and the plaintext never reaches Drive. A backup is a
// full copy of the production database in one file, sitting in ordinary cloud
// storage; encrypted, a leaked folder is worthless to whoever finds it.
// Losing BACKUP_ENCRYPTION_KEY makes every backup in Drive permanently unreadable.
//
// Uses Supabase REST API (service_role key) — no database password needed.
// Then deletes any backup it previously created in that folder older than
// RETENTION_DAYS (default 14).
//
// Required env (set as GitHub Secrets, see .github/workflows/backup.yml):
//   SUPABASE_URL               — e.g. https://xyz.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  — JWT service_role key (bypasses RLS)
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   GOOGLE_REFRESH_TOKEN
//   GDRIVE_FOLDER_ID           — id of the Drive folder to upload into
//   BACKUP_ENCRYPTION_KEY      — passphrase for AES-256 (openssl enc). Generate
//                                with `openssl rand -base64 48`; copy kept OFF GitHub.
// Optional env:
//   RETENTION_DAYS             — default 14
//   BACKUP_PREFIX              — default "project-backup"

import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import ExcelJS from "exceljs";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  GDRIVE_FOLDER_ID,
  BACKUP_ENCRYPTION_KEY,
  RETENTION_DAYS = "14",
  BACKUP_PREFIX = "project-backup",
} = process.env;

// Trimmed, and that is load-bearing — not tidiness.
//
// `-pass env:` hands openssl the variable VERBATIM, trailing newline included,
// whereas `openssl enc -d`'s interactive password prompt STRIPS the newline off
// whatever is pasted into it. So a secret saved with a stray trailing newline
// encrypts under a DIFFERENT passphrase than the one a human later types at the
// prompt — an endless `bad decrypt` against a key that looks perfectly correct,
// with no way to tell the difference by eye. Verified in both directions.
//
// Trimming here makes the two paths agree no matter how the secret was pasted.
const ENCRYPTION_KEY = (BACKUP_ENCRYPTION_KEY ?? "").trim();

function requireEnv() {
  const missing = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
    "GDRIVE_FOLDER_ID",
    // No unencrypted fallback: a missing key must stop the run, never quietly
    // ship a plaintext copy of the whole database to Drive.
    "BACKUP_ENCRYPTION_KEY",
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
  // A whitespace-only secret is truthy above but empty once trimmed — catch it
  // here rather than silently encrypting under an empty passphrase.
  if (!ENCRYPTION_KEY) {
    console.error("BACKUP_ENCRYPTION_KEY is empty after trimming whitespace");
    process.exit(1);
  }
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

const MAX_CELL = 32000;
const REST_PAGE = 1000; // rows per REST API page

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

// ---- Supabase REST helpers -------------------------------------------------

function restHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function getPublicTables() {
  // PostgREST exposes table names in its OpenAPI spec at /rest/v1/
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: restHeaders() });
  if (!res.ok) throw new Error(`OpenAPI spec failed: ${res.status} ${await res.text()}`);
  const spec = await res.json();
  const tables = Object.keys(spec.paths || {})
    .map((p) => p.replace(/^\//, ""))
    .filter((t) => t && !t.includes("/") && !t.includes("{"))
    .sort();
  const columnTypes = new Map(
    tables.map((t) => [
      t,
      Object.fromEntries(
        Object.entries(spec.definitions?.[t]?.properties ?? {}).map(([c, p]) => [
          c,
          p.format ?? "",
        ]),
      ),
    ]),
  );
  return { tables, columnTypes };
}

async function fetchAllRows(tableName) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(tableName)}`);
    url.searchParams.set("select", "*");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(REST_PAGE));
    const res = await fetch(url, { headers: restHeaders() });
    if (!res.ok) throw new Error(`Fetch ${tableName} failed: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < REST_PAGE) break;
    offset += REST_PAGE;
  }
  return rows;
}

// ---- Excel: one sheet per public table -------------------------------------

function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    let s;
    if (Buffer.isBuffer(v)) s = `\\x${v.toString("hex")}`;
    else s = JSON.stringify(v);
    return s.length > MAX_CELL ? s.slice(0, MAX_CELL) + "…(truncated)" : s;
  }
  if (typeof v === "string" && v.length > MAX_CELL) {
    return v.slice(0, MAX_CELL) + "…(truncated)";
  }
  return v;
}

function sanitizeSheetName(name, used) {
  let s = name.replace(/[[\]:*?/\\]/g, "_").slice(0, 31) || "sheet";
  let candidate = s;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `_${i++}`;
    candidate = s.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

async function buildExcel(tables, outPath) {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: outPath });
  const usedNames = new Set();

  for (const tableName of tables) {
    const rows = await fetchAllRows(tableName);
    const ws = wb.addWorksheet(sanitizeSheetName(tableName, usedNames));

    if (rows.length === 0) {
      ws.addRow(["(empty table)"]).commit();
    } else {
      const cols = Object.keys(rows[0]);
      ws.addRow(cols).commit();
      for (const row of rows) {
        ws.addRow(cols.map((c) => cellValue(row[c]))).commit();
      }
    }
    ws.commit();
    log(`  • ${tableName}: ${rows.length} rows`);
  }
  await wb.commit();
}

// ---- SQL dump (INSERT-based) -----------------------------------------------

// PostgREST returns an array column (text[], uuid[]…) as a JSON array, and its
// JSON text is a malformed array literal to Postgres: write {…} instead. Only for
// a column whose OpenAPI type (pgType) ends in [] — a json/jsonb array stays JSON.
// In json[] / jsonb[] each element is a JSON value, written as its JSON text: a
// string keeps its quotes, and a JSON array is ONE element (PostgREST sends a 2-D
// jsonb[] and a 1-D jsonb[] of JSON arrays alike; only the 1-D reading always
// loads). box[] is the one standard type whose elements are separated by ";".
function pgArrayLiteral(arr, pgType) {
  const json = pgType === "json[]" || pgType === "jsonb[]";
  const element = (x) => {
    if (x === null || x === undefined) return "NULL";
    if (Array.isArray(x) && !json) return pgArrayLiteral(x, pgType);
    const s = json || typeof x === "object" ? JSON.stringify(x) : String(x);
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  };
  return `{${arr.map(element).join(pgType === "box[]" ? ";" : ",")}}`;
}

function sqlLiteral(v, pgType = "") {
  if (v === null || v === undefined) return "NULL";
  // Not always a string: for a column the spec lacks, types[c] can be a member
  // the types object inherits ("constructor").
  const t = typeof pgType === "string" ? pgType : "";
  // json / jsonb take JSON text even for a string, number or boolean value:
  // 'present', a bare 5 or TRUE would not load.
  if (t === "json" || t === "jsonb") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v) && t.endsWith("[]")) {
    return `'${pgArrayLiteral(v, t).replace(/'/g, "''")}'`;
  }
  if (typeof v === "object") {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function buildSqlDump(tables, columnTypes, outPath) {
  const lines = [];
  lines.push("-- SQL dump generated by backup script");
  lines.push(`-- Date: ${new Date().toISOString()}`);
  lines.push("-- Schema: public");
  lines.push("");
  lines.push("SET client_encoding = 'UTF8';");
  lines.push("SET standard_conforming_strings = on;");
  // The tables come in name order, not FK order, so loading them into empty
  // tables fails on a child that sorts before its parent. Replica mode, as in
  // Supabase's own data-only dumps, skips the FK checks and the triggers.
  lines.push("SET session_replication_role = replica;");
  lines.push("");

  for (const tableName of tables) {
    log(`  dumping ${tableName}…`);
    const rows = await fetchAllRows(tableName);
    if (rows.length === 0) {
      lines.push(`-- ${tableName}: empty`);
      lines.push("");
      continue;
    }
    const cols = Object.keys(rows[0]);
    const quotedTable = `"${tableName}"`;
    const quotedCols = cols.map((c) => `"${c}"`).join(", ");
    const types = columnTypes.get(tableName) ?? {};

    lines.push(`-- Data for table: ${tableName} (${rows.length} rows)`);
    for (const row of rows) {
      const vals = cols.map((c) => sqlLiteral(row[c], types[c])).join(", ");
      lines.push(`INSERT INTO ${quotedTable} (${quotedCols}) VALUES (${vals});`);
    }
    lines.push("");
  }
  lines.push("SET session_replication_role = DEFAULT;");
  lines.push("");

  const content = lines.join("\n");
  const gzip = createGzip({ level: 9 });
  const out = createWriteStream(outPath);
  gzip.end(Buffer.from(content, "utf8"));
  await pipeline(gzip, out);
  log(`SQL dump written: ${outPath}`);
}

// ---- Encryption ------------------------------------------------------------

// AES-256-CBC via the `openssl` CLI rather than node:crypto, deliberately: the
// restore path must not depend on this repo still existing. `openssl enc -d` is a
// one-liner that works from any machine with Git for Windows / macOS / Linux,
// years from now, with nothing checked out. Hand-rolled crypto here would mean
// the decryptor lives in the very repo a disaster might take with it.
//
// PBKDF2 at 600k iterations (OWASP's SHA-256 figure) is belt-and-braces — the key
// we document is 48 random bytes, so it is not brute-forceable anyway — but it
// keeps the file safe if someone later swaps in a human-chosen passphrase.
//
// Decrypt with:
//   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in <file>.enc -out <file>
async function encryptFile(inPath, key) {
  const outPath = `${inPath}.enc`;
  const res = spawnSync(
    "openssl",
    [
      "enc",
      "-aes-256-cbc",
      "-pbkdf2",
      "-iter",
      "600000",
      "-salt",
      "-in",
      inPath,
      "-out",
      outPath,
      // Read the passphrase from the environment, never argv — argv is visible to
      // every other process on the machine via /proc.
      "-pass",
      "env:BACKUP_ENCRYPTION_KEY",
    ],
    { env: { ...process.env, BACKUP_ENCRYPTION_KEY: key } },
  );
  if (res.status !== 0) {
    const err = res.stderr ? res.stderr.toString() : "(no stderr)";
    throw new Error(`openssl enc failed (exit ${res.status}): ${err}`);
  }
  // Drop the plaintext the moment the ciphertext exists — not at the end of
  // main(), which never runs if an upload throws.
  await unlink(inPath);
  const size = (await stat(outPath)).size;
  log(`Encrypted → ${path.basename(outPath)} (${(size / 1024).toFixed(0)}KB)`);
  return outPath;
}

// ---- Google Drive (REST, no SDK) ------------------------------------------

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

async function uploadFile(token, filePath, mimeType) {
  const name = path.basename(filePath);
  const data = await readFile(filePath);
  const metadata = { name, parents: [GDRIVE_FOLDER_ID] };

  const boundary = "===============boundary" + Date.now();
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) +
        `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) {
    throw new Error(`Upload failed for ${name}: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  log(`Uploaded ${json.name} (id ${json.id})`);
}

async function deleteOldBackups(token) {
  const days = parseInt(RETENTION_DAYS, 10);
  if (!Number.isFinite(days) || days <= 0) {
    log("RETENTION_DAYS not positive — skipping cleanup");
    return;
  }
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const q = [
    `'${GDRIVE_FOLDER_ID}' in parents`,
    `createdTime < '${cutoff}'`,
    "trashed = false",
  ].join(" and ");
  const url =
    "https://www.googleapis.com/drive/v3/files?" +
    new URLSearchParams({
      q,
      fields: "files(id,name,createdTime)",
      pageSize: "1000",
    });
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`List for cleanup failed: ${res.status} ${await res.text()}`);
  }
  const { files = [] } = await res.json();
  log(`Cleanup: ${files.length} file(s) older than ${days} days`);
  for (const f of files) {
    const del = await fetch(
      `https://www.googleapis.com/drive/v3/files/${f.id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
    if (del.ok || del.status === 204) log(`  deleted ${f.name} (${f.createdTime})`);
    else log(`  WARN failed to delete ${f.name}: ${del.status}`);
  }
}

// ---- main ------------------------------------------------------------------

async function main() {
  requireEnv();
  const stamp = dateStamp();
  const xlsxPath = path.join(tmpdir(), `${BACKUP_PREFIX}_${stamp}.xlsx`);
  const sqlPath = path.join(tmpdir(), `${BACKUP_PREFIX}_${stamp}.sql.gz`);

  log(`Fetching table list from ${SUPABASE_URL}…`);
  const { tables, columnTypes } = await getPublicTables();
  log(`Found ${tables.length} tables: ${tables.join(", ")}`);

  log("Building Excel…");
  await buildExcel(tables, xlsxPath);

  log("Building SQL dump…");
  await buildSqlDump(tables, columnTypes, sqlPath);

  const xlsxSize = (await stat(xlsxPath)).size;
  const sqlSize = (await stat(sqlPath)).size;
  log(`Artifacts: xlsx ${(xlsxSize / 1024).toFixed(0)}KB, sql.gz ${(sqlSize / 1024).toFixed(0)}KB`);

  const xlsxEnc = await encryptFile(xlsxPath, ENCRYPTION_KEY);
  const sqlEnc = await encryptFile(sqlPath, ENCRYPTION_KEY);

  const token = await getAccessToken();
  await uploadFile(token, xlsxEnc, "application/octet-stream");
  await uploadFile(token, sqlEnc, "application/octet-stream");
  await deleteOldBackups(token);

  // Best-effort local cleanup (the plaintext is already gone — see encryptFile).
  await Promise.allSettled([unlink(xlsxEnc), unlink(sqlEnc)]);
  log("Backup complete ✓");
}

main().catch((err) => {
  console.error("Backup FAILED:", err);
  process.exit(1);
});
