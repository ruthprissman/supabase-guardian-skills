---
name: supabase-drive-backup
description: מגדיר גיבוי יומי אוטומטי ומוצפן של DB מ-Supabase ל-Google Drive — קובץ Excel (גיליון לכל טבלה) + SQL dump דחוס, שניהם מוצפנים ב-AES-256 לפני ההעלאה, עם מחיקת גיבויים ישנים. הפעל בכל פרויקט לקוח כשרוצים להגן מפני אובדן נתונים (חשוב במיוחד ב-free tier שאין לו גיבויים מובנים).
version: 2.2.0
user-invocable: true
---

# Supabase → Google Drive — גיבוי יומי מוצפן

שני קבצים לכל ריצה, **מוצפנים** ומועלים לתיקיית Drive:

- `<prefix>_<date>.xlsx.enc` — גיליון אחד לכל טבלה בסכמת public (קריא לאדם)
- `<prefix>_<date>.sql.gz.enc` — SQL INSERT dump (ניתן לשחזור)

**תדירות:** כל יום ב-01:00 UTC (~03:00/04:00 ישראל). גם מונע auto-pause ב-free tier.
**מחיקת גיבויים ישנים:** בכל ריצה נמחקים קבצים ישנים מעבר ל-`RETENTION_DAYS` (ברירת מחדל: **14 יום**). כך תמיד נשמרים בדיוק שבועיים אחורה.

**גישה:** Supabase REST API עם `service_role` key — **ללא סיסמת DB בכלל**. מעקף RLS אוטומטי.

**הצפנה:** AES-256 (openssl, PBKDF2 600k) לפני ההעלאה. ראו סעיף "הצפנה" למטה.

---

## הצפנה — חובה, לא אופציה

קובץ גיבוי הוא **עותק מלא של מסד הייצור בקובץ אחד**, שיושב באחסון ענן רגיל. אם
בפרויקט יש נתונים אישיים — קטינים, ת"ז, מידע רפואי, פרטי לקוחות — עותק גלוי
בדרייב הוא חשיפה שקשה להצדיק, ובישראל גם נכנס לתחולת תקנות הגנת הפרטיות
(אבטחת מידע), התשע"ז-2017, שחלות במפורש גם על קובצי הגיבוי ולא רק על המאגר החי.

- **אין נפילה חזרה לגלוי.** מפתח חסר → הריצה נעצרת. עדיף בלי גיבוי מאשר גיבוי
  גלוי בשקט, שאף אחד לא ישים לב אליו.
- **openssl דרך ה-CLI ולא `node:crypto`**, במכוון: מסלול השחזור לא תלוי בקיום
  הריפו. מפענח שחי בריפו שאסון עלול לקחת איתו הוא לא מפענח.
- **הטקסט הגלוי נמחק מהרנר** ברגע שנוצר הצופן, לא בסוף `main()` — שלא רץ אם
  ההעלאה נכשלת.

### המפתח

```bash
openssl rand -base64 48   # 64 תווים. זה המפתח.
```

נשמר בשני מקומות: כ-GitHub Secret בשם `BACKUP_ENCRYPTION_KEY`, **ובנפרד מחוץ
ל-GitHub** (מנהל סיסמאות). GitHub לא מציג סוד בחזרה אחרי שמירה — הוא אינו גיבוי
של המפתח. מפתח אבוד = כל הגיבויים בדרייב בלתי קריאים לצמיתות.

אל תשמור את המפתח באותה תיקיית Drive שאליה מגבים.

### ⚠ המלכודת של ירידת השורה — אל תסיר את ה-trim

`-pass env:` מוסר את המשתנה ל-openssl **verbatim, כולל ירידת שורה**, בעוד ששורת
בקשת הסיסמה של `openssl enc -d` **מסירה** אותה. בלי `.trim()` על המפתח, סוד
שנשמר עם ירידת שורה תועה מצפין תחת סיסמה אחרת מזו שאדם יקליד בשחזור — `bad
decrypt` נצחי מול מפתח שנראה נכון לחלוטין, בלי דרך להבחין בהבדל בעין.
אומת בשני הכיוונים. הקוד עושה trim; אל תסיר אותו.

### פענוח

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in <file>.enc -out <file>
```

ב-Windows: `openssl` מגיע עם Git for Windows (Git Bash). הדבקה בגיט באש היא
לחיצה ימנית → Paste או Shift+Insert — **לא** Ctrl+V. בזמן הדבקת הסיסמה המסך
נשאר ריק, וזה תקין.

---

## קבצים בסקיל (assets/)

| קובץ | לאן להעתיק בריפו |
|------|-----------------|
| `backup.mjs` | `scripts/backup/backup.mjs` |
| `package.json` | `scripts/backup/package.json` |
| `get-refresh-token.mjs` | `scripts/backup/get-refresh-token.mjs` |
| `backup.workflow.yml` | `.github/workflows/backup.yml` |
| `verify-backup.sh` | `scripts/backup/verify-backup.sh` |
| `RETROFIT-PROMPT.md` | לא מועתק — פרומפט להחלה על פרויקט **קיים** |

העתק את הקבצים ואז עקוב אחר השלבים. הסקריפט קורא הכל מ-env / GitHub Secrets.

**לפרויקט שכבר רץ בו גיבוי ללא הצפנה**: אל תעתיק את התבנית מעליו — היא עלולה
לדרוס התאמות מקומיות (טבלאות מוחרגות, מימוש `pg_dump` במקום REST). השתמש
ב-`assets/RETROFIT-PROMPT.md` — פרומפט מוכן שמכוון את הסוכן לזהות את המימוש
הקיים ולעדכן אותו במקום.

---

## ⚠ אזהרות קריטיות — כל אחת עלתה שעות

1. **ברירת המחדל היא REST + `service_role` key** — גישה לכל הנתונים, מעקף RLS,
   בלי סיסמת DB בכלל.

   ⚠ **תוקן 30.8.2026 — הניסוח הקודם כאן היה גורף מדי.** הוא אמר "אל תנסה
   `pg_dump` דרך ה-pooler", ובשטח **זה עובד**: פרויקט בייצור מריץ `pg_dump`
   יומיומי מ-GitHub Actions דרך ה-**Session pooler**. הדיוקים:

   - **Session pooler, פורט 5432** — עובד (משתמש `postgres.<project-ref>`,
     הכתובת מכילה `pooler`). **Transaction pooler, 6543** — `pg_dump` נכשל מולו.
     **Direct connection** — IPv6 בלבד, GitHub Actions נופל על `ENETUNREACH`.
     ההבחנה בין שלושת אלה היא מה שהאזהרה המקורית פספסה.
   - סנכרון סיסמה: **איפוס סיסמת `postgres` מהדאשבורד הגיע ל-pooler תוך פחות
     מדקה** (נמדד). מה שאינו מסתנכרן מיד הוא `ALTER ROLE` על תפקיד שנוצר ידנית.

   **מתי חייבים `pg_dump`:** כשצריך גם את סכמת `auth` — ל-REST אין אליה גישה,
   נקודה. פרויקט עם FK ל-`auth.users` אינו בר-שחזור בלי pg_dump (ראה "מה הגיבוי
   לא מכסה").

2. **`pg_dump` חייב להיות מגרסת השרת ומעלה — ו-`pg_dump --version` משקר לך.**
   (רלוונטי רק למימוש pg_dump.) שרת Supabase היום הוא 17.x; `pg_dump` 16 מסרב:
   `aborting because of server version mismatch`. לכן ה-workflow מתקין
   `postgresql-client-17` מ-`apt.postgresql.org`.

   ⚠ **המלכודת:** גם *אחרי* התקנה מוצלחת של 17, `pg_dump --version` על הרנר
   מדפיס `16.15`. זה `pg_wrapper` של דביאן — הוא עונה על `--version` לפי
   ה-cluster המקומי (16), אבל בחיבור **למארח מרוחק** בוחר את הלקוח החדש ביותר
   (17). אל תרדוף אחרי זה. הראיה האמיתית היא בכותרת הדאמפ עצמו:
   ```bash
   zcat dump.sql.gz | grep -m1 'Dumped by pg_dump'   # → 17.11
   ```

3. **Google refresh tokens פגים אחרי 7 ימים כשה-OAuth app ב-"Testing".**
   ב-Google Cloud → OAuth consent screen, שנה את ה-publishing status ל-**"In production"**.
   הסקופ `drive.file` אינו sensitive ולא דורש verification של גוגל.

4. **Secrets דורש Admin בריפו; cron רץ רק מ-default branch.**
   Actions Secrets נגיש רק ל-Admin. `schedule:` cron רץ רק מ-`main` — ה-workflow חייב להיות ממוזג ל-main.

5. **Drive account ≠ account של ה-agent.**
   התיקייה חייבת להיות ב-Google account של הלקוח, ו-refresh token חייב להיות של אותו account.

6. **ריפו מועתק (mirrored) מריץ את ה-cron פעמיים — הגרסה ללא secrets נכשלת.**
   אם הפרויקט מועלה ליותר מ-remote אחד ב-GitHub (למשל Lovable), ה-workflow קיים בשני הריפוים.
   **פתרון:** הוסף `if: github.repository == 'OWNER/REPO'` ל-job.

---

## שלב 1 — הוסף קבצים לריפו

העתק את הקבצים לנתיבים בטבלה למעלה.
ערוך `BACKUP_PREFIX` ב-workflow לשם הפרויקט (למשל `"my-project"`).
Commit ו-merge ל-**default branch (main)** של ריפו שיש לך בו **Admin**.

## שלב 2 — תיקיית Google Drive

ב-Google Drive של **account היעד**, צור תיקייה. העתק את ה-id מה-URL (`/folders/<GDRIVE_FOLDER_ID>`).

## שלב 3 — Google OAuth (Desktop client + refresh token)

1. Google Cloud Console → פרויקט → **Enable Google Drive API**.
2. **OAuth consent screen** → External → הוסף את account היעד כ-**Test user** → **Publish app / In production** (אזהרה #3).
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
| `BACKUP_ENCRYPTION_KEY` | `openssl rand -base64 48` — **ועותק נשמר מחוץ ל-GitHub** |

שמות case-sensitive, ללא רווחים מסביב.

## שלב 5 — אימות end-to-end

הרץ את ה-workflow ידנית: **Actions → Daily DB Backup → Run workflow**.
ודא: ריצה ירוקה, **row counts אמיתיים (לא `0 rows`)**, והקבצים בתיקיית Drive
**עם סיומת `.enc`**.

**ריצה ירוקה מוכיחה שהקובץ נוצר והועלה — לא שאפשר לפתוח אותו.** גיבוי מוצפן
שאינו נפתח שווה בדיוק כמו שאין גיבוי, וזה מתגלה ביום הגרוע ביותר. שתי בדיקות,
ושתיהן נדרשות — הן בודקות דברים שונים:

### א. הלקוחה מריצה את `verify-backup.sh` על העותק **שלה** של המפתח

```bash
bash verify-backup.sh <prefix>_<date>*.enc
```

מפענח לעותק זמני, מוודא שה-gzip שלם, סופר טבלאות ושורות, מאתר את `auth.users`,
מדפיס שורת נתונים אמיתית — ומוחק את העותק הגלוי בסיום. **זו הבדיקה היחידה
שמאמתת שהעותק השמור של המפתח זהה לזה שב-GitHub.** הריצה עצמה לעולם לא תגלה
פער כזה.

### ב. job ב-CI שמוריד מ-Drive ומפענח עם ה-secret

זו הבדיקה היחידה שתופסת קלקול שקרה **אחרי** ההצפנה — בהעלאה או באחסון — והיא
לא דורשת שאף אדם יחזיק את המפתח. שלב זמני, מוחקים אחריו:

```bash
ACCESS="$(curl -sS -X POST https://oauth2.googleapis.com/token \
  -d client_id="$GOOGLE_CLIENT_ID" -d client_secret="$GOOGLE_CLIENT_SECRET" \
  -d refresh_token="$GOOGLE_REFRESH_TOKEN" -d grant_type=refresh_token | jq -r .access_token)"

curl -sS -G https://www.googleapis.com/drive/v3/files -H "Authorization: Bearer $ACCESS" \
  --data-urlencode "q='$GDRIVE_FOLDER_ID' in parents and trashed=false" \
  --data-urlencode "orderBy=createdTime desc" \
  --data-urlencode "fields=files(id,name,size,createdTime)" > listing.json

# ⚠ קובץ ה-auth מסתיים גם הוא ב-".sql.gz.enc" והוא מועלה אחרון — כלומר הוא
# הראשון ברשימה הממוינת. בלי ההחרגה תבדוק אותו פעמיים ואת דאמפ ה-public בכלל לא.
id="$(jq -r 'first(.files[] | select((.name|endswith(".sql.gz.enc")) and
       (.name|endswith("_auth.sql.gz.enc")|not))) | .id' listing.json)"

curl -sS -H "Authorization: Bearer $ACCESS" \
  "https://www.googleapis.com/drive/v3/files/$id?alt=media" -o dl.enc
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in dl.enc -out dl.sql.gz \
  -pass env:BACKUP_ENCRYPTION_KEY
gzip -t dl.sql.gz                                   # שלמות
zcat dl.sql.gz | grep -m1 'Dumped by pg_dump'       # גרסה אמיתית (אזהרה #2) — דאמפ של pg_dump
zcat dl.sql.gz | grep -c '^COPY '                   # כמה טבלאות עם נתונים — דאמפ של pg_dump
zcat dl.sql.gz | grep -c '^INSERT INTO '            # כמה שורות נתונים — דאמפ ה-INSERT של התבנית
```

ה-`drive.file` scope מציג רק קבצים שהאפליקציה עצמה יצרה, ולכן ה-listing הזה הוא
גם דוח מצב נקי של תיקיית הגיבוי — כולל **כמה קבצים גלויים עוד נשארו בה** מלפני
המעבר להצפנה.

---

## לוח זמנים ושמירה

- **תדירות ריצה:** כל יום ב-01:00 UTC (03:00/04:00 ישראל)
- **כמה גיבויים נשמרים:** 14 ימים אחורה (כ-14 זוגות קבצים)
- **מחיקה:** בכל ריצה נמחקים קבצים שנוצרו לפני יותר מ-14 יום
- לשינוי: ערוך `RETENTION_DAYS` ב-workflow (מספר ימים)

**דיוק חשוב במיוחד בריטרופיט:** הניקוי מוחק **כל** קובץ בתיקייה שגילו מעל
`RETENTION_DAYS` — הוא אינו מסנן לפי `BACKUP_PREFIX`. שתי תוצאות:

- **הגיבויים הגלויים הישנים נמחקים מעצמם** תוך `RETENTION_DAYS` יום מהמעבר
  להצפנה, וכך גם קובצי בדיקה שנוצרו בדרך. אין צורך לבקש מהלקוחה למחוק ידנית —
  רק להסביר שהחשיפה נמשכת עד התאריך הזה, ושאם היא רוצה שתיעלם היום, המחיר הוא
  אובדן נקודות שחזור אחורה.
- **קבצים אחרים של הלקוחה באותה תיקייה אינם בסכנה**: ה-scope הוא `drive.file`,
  שמראה לאפליקציה רק את מה שהיא עצמה יצרה. היא לא רואה אותם ולא יכולה למחוק אותם.

---

## שחזור

כל קובץ עובר **קודם פענוח**:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
  -in backup_DATE.sql.gz.enc -out backup_DATE.sql.gz
```

- **`.xlsx`** = חיפוש נתונים ידני. אחרי הפענוח זה כבר קובץ אקסל תקין — לחיצה
  כפולה ונפתח. אין `gunzip`.
- **`.sql.gz`** = שחזור נתונים:
  ```bash
  gunzip backup_DATE.sql.gz
  # בממשק Supabase → SQL Editor, הדבק את תוכן הקובץ
  # או:
  psql "postgresql://postgres.<ref>:<pwd>@<pooler-host>:5432/postgres" -f backup_DATE.sql
  ```

  ⚠ **תוקן 28.10.2026 — שלושה באגים מנעו את שחזור ה-SQL dump.** עמודות מערך
  (`text[]`, `uuid[]`…) נכתבו כ-JSON, ש-Postgres דוחה (`malformed array literal`);
  עמודת `json`/`jsonb` שערכה מחרוזת, מספר או בוליאני נכתבה בלי קידוד JSON ונדחתה;
  וסדר הטבלאות לפי השם שבר את ה-FK בשחזור לטבלאות ריקות. עכשיו התבנית כותבת כל
  ערך לפי סוג העמודה מה-OpenAPI spec (array literal `{…}` למערך), ועוטפת את
  הנתונים ב-`session_replication_role = replica` — שמדלג גם על ה-FK
  ל-`auth.users` (ראה "מה הגיבוי הזה לא מכסה"). פרויקט שהעתיק את `backup.mjs`
  לפני התאריך הזה **עדיין נושא את הבאגים**: העתק אליו את `pgArrayLiteral` /
  `sqlLiteral` / `getPublicTables` החדשות ואת שתי שורות ה-`SET`, והעבר את הסוגים
  מ-`main()` דרך `buildSqlDump` עד הקריאה לכל עמודה:
  `const types = columnTypes.get(tableName) ?? {}` לכל טבלה,
  ו-`sqlLiteral(row[c], types[c])`. בלי הצעד האחרון `sqlLiteral` לא מקבל סוג:
  מערך נכתב שוב כ-JSON, ערך `jsonb` שוב בלי קידוד — והריצה עדיין ירוקה.

**`psql` לא מגיע עם Git for Windows.** מתקינים מ-postgresql.org/download/windows,
ובמסך Select Components משאירים מסומן רק **Command Line Tools**. אם אחרי ההתקנה
`psql` לא נמצא — להוסיף לנתיב את `C:\Program Files\PostgreSQL\<ver>\bin`.
כדאי לעשות את זה **לפני** שצריך, לא בזמן אסון.

### ⚠ מה הגיבוי הזה לא מכסה

מכסה **data** של סכמת public. **לא** מכסה DDL (טבלאות, indexes), `auth`, או
`storage`. לשחזור מלא עם schema — נדרש Pro plan עם Supabase point-in-time recovery.

**החור הכי מסוכן הוא `auth`**, והוא לא תיאורטי: אם בסכמת public יש טבלת משתמשים
עם מפתח זר ל-`auth.users(id)` — דפוס ברירת המחדל של Supabase — אז בשחזור לפרויקט
חדש דאמפ של `pg_dump` **נכשל על האילוץ**, לא רק "חסרות התחברויות". הדאמפ של
התבנית הזאת גרוע מזה: הוא נטען ב-`replica`, שמדלג על בדיקות ה-FK, ולכן הטעינה
**מצליחה בשקט** עם שורות שמצביעות על משתמשות שאינן קיימות — וה-FK נשאר מסומן
תקין, ו-Postgres לא בודק אותו שוב. בשני המקרים גיבוי שנראה תקין אינו בר-שחזור
בפועל.

- **בפרויקט שמגבה דרך `pg_dump`** (לא התבנית הזאת): הוסף קובץ שלישי —
  `pg_dump --data-only --table=auth.users --table=auth.identities`. **data-only
  במכוון**: פרויקט Supabase חדש כבר מגיע עם סכימת `auth`, ואסור לנסות ליצור
  אותה מחדש. בשחזור טוענים **auth לפני public**.

  ⚠ **החיבור חייב להיות של `postgres`, לא של `backup_reader` ייעודי.** נבדק
  בשטח: אפשר להעניק ל-`backup_reader` את ה-`select` על `auth.users` /
  `auth.identities`, אבל **לא** את ה-`usage` על הסכימה `auth` — היא בבעלות
  `supabase_auth_admin`, ו-`postgres` אינו חבר בו (`set role supabase_auth_admin`
  → `42501: permission denied to set role`). אין בפרויקט זהות שיכולה להעניק
  את זה, ולכן `backup_reader` נופל תמיד על `permission denied for schema auth`.
  המחיר: תפקיד הגיבוי אינו קריאה-בלבד.

  ⚠⚠ **`GRANT` שנכשל מחוסר סמכות אינו מחזיר שגיאה.** PostgreSQL מוציא `WARNING`
  ומדווח הצלחה; ממשק Supabase מציג `Success. No rows returned` והכול נראה תקין
  בזמן ששום הרשאה לא ניתנה. **תמיד אמת בנפרד:**
  ```sql
  select has_schema_privilege('<role>','auth','USAGE');
  ```
- **בתבנית הזאת (REST + service_role)**: אין גישה ל-`auth.users` דרך PostgREST.
  ה-Auth Admin API מחזיר רשימת משתמשים ומטא-דאטה אבל **לא גיבובי סיסמאות**, כך
  שממנו אפשר לשחזר *מי* היו המשתמשות — לא את היכולת שלהן להתחבר. תעד את זה
  ללקוחה במפורש: בשחזור, כל המשתמשות יצטרכו לאפס סיסמה. ובשחזור לפרויקט חדש
  **קודם** יוצרים את משתמשות ה-auth באותם `id` (Admin API), ורק אז טוענים את
  הדאמפ: אם מדלגים על זה, הטעינה לא נכשלת (ראה למעלה).
  ⚠ אם טריגר על `auth.users` יוצר שורה ב-public לכל משתמשת חדשה (דפוס ה-profiles
  הנפוץ), יצירת המשתמשות כבר מילאה את הטבלה הזו: **רוקן אותה לפני הטעינה**, אחרת
  ה-INSERT שלה נכשל על מפתח כפול, ובטעינה כטרנזקציה אחת כל השחזור נעצר. גם הסדר
  ההפוך לא עובד כשהטריגר בלי `on conflict`: הוא נכשל על אותו מפתח, ויצירת
  המשתמשת נכשלת איתו.

וגם: קבצי Storage אינם ב-DB כלל, ומשימות pg_cron ו-Edge Functions צריכות פריסה
מחדש.

**מגבלות ידועות של דאמפ ה-INSERT בתבנית** (מהתיעוד של Postgres ומבדיקות בלי
שרת, לא משחזור אמיתי). לפני שמסתמכים על התבנית בפרויקט, בדוק במסד שאין בו אחד
מאלה:
- **view או materialized view** ב-public נכנס לרשימת הטבלאות, וה-INSERT אליו
  נכשל בשחזור.
- **serial / identity:** המונה לא מתקדם עם השחזור, והשורה החדשה הראשונה נכשלת
  על מפתח כפול. אחרי הטעינה מריצים `setval` לכל מונה.
- **`GENERATED ALWAYS`** (identity או עמודה מחושבת) דוחה ערך מפורש, וכל השורות
  של הטבלה נכשלות.
- **עמודה מסוג composite** (או מערך שלו) נכתבת כ-JSON ונדחית.
- **מספר שלם מעל 2^53 או numeric ארוך** מאבד דיוק בדרך (JSON של JavaScript).
- **הקריאה בעמודים** (offset בלי order) אינה snapshot: שורה שמשתנה באמצע הריצה
  עלולה להופיע פעמיים או להיעלם.

---

## ניקוי אבטחה

כל secret שעבר דרך הצ'אט (service_role key, client secret, refresh token) — כדאי לרוטט אחרי ההגדרה:
- `service_role` key: לא ניתן לאיפוס ישיר, אבל גישתו מוגבלת לפרויקט הספציפי
- צור מחדש OAuth client secret ב-Google Cloud
- מנה מחדש refresh token על ידי ביטול הרשאות ב-Google Account ו-flow מחדש
