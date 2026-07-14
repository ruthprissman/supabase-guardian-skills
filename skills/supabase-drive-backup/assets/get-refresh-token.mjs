// One-time helper: obtain a Google OAuth2 refresh token for the backup script.
//
// Run LOCALLY (not in CI) on a machine with a browser:
//   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node get-refresh-token.mjs
//
// Prereqs in Google Cloud Console (one time):
//   1. Create a project — enable the "Google Drive API".
//   2. OAuth consent screen — External — add yourself as a Test user.
//   3. Credentials — Create OAuth client ID — type "Desktop app".
//   4. Copy the client id + secret into the env vars above.
//
// It opens a consent URL, captures the code on http://localhost:53682,
// exchanges it, and prints the refresh token. Store that as the
// GOOGLE_REFRESH_TOKEN secret. Scope is drive.file (per-file access — the app
// can only touch files it creates, which is all we need).

import http from "node:http";

const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/drive.file";

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars first.");
  process.exit(1);
}

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // force a refresh_token even on re-consent
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("No code in callback.");
    return;
  }
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.refresh_token) {
      res.writeHead(200).end("No refresh_token returned. Revoke prior access and retry.");
      console.error("\nNo refresh_token in response:", tokens);
    } else {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(
        "Got it! You can close this tab and return to the terminal.",
      );
      console.log("\n==============================================");
      console.log("GOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
      console.log("==============================================\n");
      console.log("Save that value as a GitHub Secret. Done.");
    }
  } catch (e) {
    res.writeHead(500).end("Error: " + e.message);
    console.error(e);
  } finally {
    server.close();
  }
});

server.listen(PORT, () => {
  console.log("Add this redirect URI to your OAuth client first:\n  " + REDIRECT);
  console.log("\nOpen this URL in your browser and approve:\n");
  console.log(authUrl + "\n");
});
