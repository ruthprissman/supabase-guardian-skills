---
name: supabase-drive-backup
description: מגדיר גיבוי יומי אוטומטי של DB מ-Supabase ל-Google Drive — קובץ Excel (גיליון לכל טבלה) + SQL dump דחוס, עם מחיקת גיבויים ישנים. הפעל בכל פרויקט לקוח כשרוצים להגן מפני אובדן נתונים (חשוב במיוחד ב-free tier שאין לו גיבויים מובנים).
version: 2.0.0
user-invocable: true
---

# Supabase → Google Drive — גיבוי יומי

שני קבצים לכל ריצה, מועלים לתיקיית Drive:

- `<prefix>_<date>.xlsx` — גיליון אחד לכל טבלה בסכמת public (קריא לאדם)
- `<prefix>_<date>.sql.gz` — SQL INSERT dump (ניתן לשחזור)

**תדירות:** כל יום ב-01:00 UTC (~03:00/04:00 ישראל). גם מונע auto-pause ב-free tier.
**מחיקת גיבויים ישנים:** בכל ריצה נמחקים קבצים ישנים מעבר ל-`RETENTION_DAYS` (ברירת מחדל: **14 יום**). כך תמיד נשמרים בדיוק שבועיים אחורה.

**גישה:** Supabase REST API עם `service_role` key — **ללא סיסמת DB בכלל**. מעקף RLS אוטומטי.

---

## קבצים בסקיל (assets/)

| קובץ | לאן להעתיק בריפו |
|------|-----------------|
| `backup.mjs` | `scripts/backup/backup.mjs` |
| `package.json` | `scripts/backup/package.json` |
| `get-refresh-token.mjs` | `scripts/backup/get-refresh-token.mjs` |
| `backup.workflow.yml` | `.github/workflows/backup.yml` |

העתק את הקבצים ואז עקוב אחר השלבים. הסקריפט קורא הכל מ-env / GitHub Secrets.

---

## ⚠ אזהרות קריטיות — כל אחת עלתה שעות

1. **אל תנסה pg_dump דרך ה-pooler של Supabase.**
   Supabase Supavisor (pooler) לא מסנכרן שינויי סיסמה (`ALTER ROLE`) בזמן אמת — שינויים לוקחים שעות להגיע אליו. גם Direct connection לא עובד מ-GitHub Actions (IPv6 בלבד ב-free tier).
   **פתרון:** השתמש ב-REST API עם `service_role` key (גישה לכל הנתונים, מעקף RLS, ללא סיסמת DB).

2. **Google refresh tokens פגים אחרי 7 ימים כשה-OAuth app ב-"Testing".**
   ב-Google Cloud → OAuth consent screen, שנה את ה-publishing status ל-**"In production"**.
   הסקופ `drive.file` אינו sensitive ולא דורש verification של גוגל.

3. **Secrets דורש Admin בריפו; cron רץ רק מ-default branch.**
   Actions Secrets נגיש רק ל-Admin. `schedule:` cron רץ רק מ-`main` — ה-workflow חייב להיות ממוזג ל-main.

4. **Drive account ≠ account של ה-agent.**
   התיקייה חייבת להיות ב-Google account של הלקוח, ו-refresh token חייב להיות של אותו account.

5. **ריפו מועתק (mirrored) מריץ את ה-cron פעמיים — הגרסה ללא secrets נכשלת.**
   אם הפרויקט מועלה ליותר מ-remote אחד ב-GitHub (למשל Lovable), ה-workflow קיים בשני הריפוים.
   **פתרון:** הוסף `if: github.repository == 'OWNER/REPO'` ל-job.

---

## שלב 1 — הוסף קבצים לריפו

העתק את 4 הקבצים לנתיבים בטבלה למעלה.
ערוך `BACKUP_PREFIX` ב-workflow לשם הפרויקט (למשל `"nechami"`).
Commit ו-merge ל-**default branch (main)** של ריפו שיש לך בו **Admin**.

## שלב 2 — תיקיית Google Drive

ב-Google Drive של **account היעד**, צור תיקייה. העתק את ה-id מה-URL (`/folders/<GDRIVE_FOLDER_ID>`).

## שלב 3 — Google OAuth (Desktop client + refresh token)

1. Google Cloud Console → פרויקט → **Enable Google Drive API**.
2. **OAuth consent screen** → External → הוסף את account היעד כ-**Test user** → **Publish app / In production** (אזהרה #2).
3. **Credentials → Create OAuth client ID → Desktop app** → שמור Client ID + Client Secret.

**קבלת refresh token — flow ידני (ללא שרת מקומי):**

1. פתח את ה-URL הזה בדפדפן (מחובר ל-Google account היעד):
   ```
   https://accounts.google.com/o/oauth2/v2/auth?client_id=<CLIENT_ID>&redirect_uri=http%3A%2F%2Flocalhost%3A53682&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file&access_type=offline&prompt=consent
   ```
2. לאחר אישור, הדפדפן יציג **`ERR_CONNECTION_REFUSED`** — זה צפוי. ה-code נמצא בשורת ה-URL (`?...&code=4/0A...`). העתק את **כל** שורת ה-URL.
3. המר את ה-code ל-refresh token:
   ```bash
   curl -s -X POST https://oauth2.googleapis.com/token \
     --data-urlencode "code=<CODE>" \
     --data-urlencode "client_id=<CLIENT_ID>" \
     --data-urlencode "client_secret=<CLIENT_SECRET>" \
     --data-urlencode "redirect_uri=http://localhost:53682" \
     --data-urlencode "grant_type=authorization_code"
   ```
   `refresh_token` מה-JSON הוא `GOOGLE_REFRESH_TOKEN`.
   אם קיבלת `invalid_grant` — ה-code כבר נוצל או פג תוקף. בצע את ה-flow מחדש.

לחלופין: אם יש אפשרות להריץ node מקומית, השתמש ב-`get-refresh-token.mjs`.

## שלב 4 — GitHub Secrets

Settings → Secrets and variables → Actions → הוסף בדיוק:

| Secret | ערך |
|--------|-----|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT מ-Dashboard → Settings → API → service_role |
| `GDRIVE_FOLDER_ID` | id מה-URL של תיקיית Drive |
| `GOOGLE_CLIENT_ID` | מ-Google Cloud Credentials |
| `GOOGLE_CLIENT_SECRET` | מ-Google Cloud Credentials |
| `GOOGLE_REFRESH_TOKEN` | מהצעד הקודם |

שמות case-sensitive, ללא רווחים מסביב.

## שלב 5 — אימות end-to-end

הרץ את ה-workflow ידנית: **Actions → Daily DB Backup → Run workflow**.
ודא: ריצה ירוקה, **row counts אמיתיים (לא `0 rows`)**, שני קבצים בתיקיית Drive.

---

## לוח זמנים ושמירה

- **תדירות ריצה:** כל יום ב-01:00 UTC (03:00/04:00 ישראל)
- **כמה גיבויים נשמרים:** 14 ימים אחורה (כ-14 זוגות קבצים)
- **מחיקה:** בכל ריצה נמחקים קבצים שנוצרו לפני יותר מ-14 יום
- לשינוי: ערוך `RETENTION_DAYS` ב-workflow (מספר ימים)

---

## שחזור

- **`.xlsx`** = חיפוש נתונים ידני
- **`.sql.gz`** = שחזור נתונים:
  ```bash
  gunzip backup_DATE.sql.gz
  # בממשק Supabase → SQL Editor, הדבק את תוכן הקובץ
  # או:
  psql "postgresql://postgres.<ref>:<pwd>@<pooler-host>:5432/postgres" -f backup_DATE.sql
  ```
  מכסה **data** של סכמת public. לא מכסה DDL (טבלאות, indexes), auth, או storage.
  לשחזור מלא עם schema — נדרש Pro plan עם Supabase point-in-time recovery.

---

## ניקוי אבטחה

כל secret שעבר דרך הצ'אט (service_role key, client secret, refresh token) — כדאי לרוטט אחרי ההגדרה:
- `service_role` key: לא ניתן לאיפוס ישיר, אבל גישתו מוגבלת לפרויקט הספציפי
- צור מחדש OAuth client secret ב-Google Cloud
- מנה מחדש refresh token על ידי ביטול הרשאות ב-Google Account ו-flow מחדש
