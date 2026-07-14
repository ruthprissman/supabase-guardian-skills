# 🛡️ Supabase Guardian Skills

שלושה **Claude Code Skills** שמגנים על פרויקט Supabase — אבטחה, גיבוי, ומניעת הקפאה.
מיועדים בעיקר לפרויקטים על התוכנית החינמית (free tier) של Supabase, שבה אין גיבויים מובנים והפרויקט קופא אחרי חוסר פעילות.

---

## מה יש בפנים

| Skill | מה הוא עושה | מתי מפעילים |
|-------|-------------|-------------|
| 🔐 **security-code-review** | סקירת אבטחה של הקוד: RLS policies, Edge Functions, secrets חשופים, auth flows ואינטגרציית Brevo. מדרג ממצאים לפי חומרה ומציע תיקונים. | "תעשה security review", "תבדוק אבטחה", "check security" |
| 💾 **supabase-drive-backup** | גיבוי יומי אוטומטי של ה-DB ל-Google Drive — קובץ Excel (גיליון לכל טבלה) + SQL dump דחוס, עם מחיקת גיבויים ישנים. | "תגדיר גיבוי", "backup the DB" |
| ⏰ **supabase-keep-alive** | מונע הקפאה של פרויקט Supabase חינמי — כותב heartbeat ל-DB כל 3 ימים, וגם מונע השבתה של ה-GitHub workflow אחרי 60 יום. | "תמנע הקפאה", "keep alive" |

הכל מבוסס על **REST API עם service_role key** — בלי סיסמת DB, בלי חשיפת secrets בקוד.

---

## דרישות מוקדמות

- **[Claude Code](https://claude.com/claude-code)** מותקן (הסקילים רצים בתוכו).
- פרויקט **Supabase** (הסקילים מכוונים ל-Supabase + Edge Functions).
- ל-backup ול-keep-alive: ריפו ב-**GitHub** עם הרשאת **Admin** (בשביל Secrets ו-Actions).

---

## התקנה

הסקילים צריכים לשבת בתיקיית הסקילים של Claude Code:
`~/.claude/skills/` (ב-Windows: `%USERPROFILE%\.claude\skills\`).

### אפשרות א' — התקנה אוטומטית (מומלץ)

הורידו/שכפלו את הריפו, ואז:

**Windows (PowerShell):**
```powershell
git clone <REPO_URL>
cd supabase-guardian-skills
.\install.ps1
```

**Mac / Linux:**
```bash
git clone <REPO_URL>
cd supabase-guardian-skills
chmod +x install.sh && ./install.sh
```

הסקריפט מעתיק את שלושת הסקילים ל-`~/.claude/skills/`. **אתחלו את Claude Code** אחרי ההתקנה כדי שיטענו.

### אפשרות ב' — התקנה ידנית

העתיקו את שלוש התיקיות שמתחת ל-`skills/` לתוך תיקיית הסקילים שלכם:

```
~/.claude/skills/security-code-review/
~/.claude/skills/supabase-drive-backup/
~/.claude/skills/supabase-keep-alive/
```

### לבדוק שזה עבד

פתחו Claude Code והקלידו `/` — שלושת הסקילים אמורים להופיע ברשימה. או פשוט בקשו "תעשה security review" והסקיל יתחיל לעבוד.

---

## שימוש קצר

### 🔐 security-code-review
פותחים את הפרויקט ב-Claude Code ואומרים **"תעשה security review"**. הסקיל:
1. ממפה את הקוד (Edge Functions, migrations, env).
2. סורק לפי חומרה: 🔴 Critical → 🟠 High → 🟡 Medium → 🔵 Low.
3. מציג דוח מסודר ו**עוצר** — לא מתקן כלום עד אישור מפורש.

> קבצי ה-reference בתיקייה (`references/`) מכילים OWASP Top 10 בהקשר Supabase, תבנית Edge Function מאובטחת, ו-best practices ל-Brevo.

### 💾 supabase-drive-backup
מבקשים מ-Claude Code להגדיר גיבוי, והוא יעביר אתכם צעד-צעד. בגדול:
1. מעתיקים את הקבצים מ-`assets/` לריפו (`scripts/backup/` + `.github/workflows/backup.yml`).
2. יוצרים תיקיית Google Drive + OAuth client (Desktop) ומפיקים `refresh_token`.
3. מוסיפים **6 GitHub Secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GDRIVE_FOLDER_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
4. מריצים את ה-workflow ידנית לאימות.

הגיבוי רץ כל יום ב-01:00 UTC ושומר 14 יום אחורה. הפרטים המלאים ב-[`skills/supabase-drive-backup/SKILL.md`](skills/supabase-drive-backup/SKILL.md).

### ⏰ supabase-keep-alive
1. יוצרים טבלת `keep_alive` (SQL מוכן בסקיל).
2. יוצרים `.github/workflows/keep-alive.yml` (מוכן בסקיל).
3. מוסיפים **2 GitHub Secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

רץ כל 3 ימים. הפרטים ב-[`skills/supabase-keep-alive/SKILL.md`](skills/supabase-keep-alive/SKILL.md).

---

## ⚠️ אבטחה — חשוב

- הריפו הזה **לא מכיל שום secret אמיתי** — רק placeholders ושמות משתני סביבה.
- ה-`service_role key` הוא מפתח פרטי: **לעולם לא בקוד ולא ב-git** — רק כ-GitHub Secret.
- אל תעלו קובץ `.env` לגיט (ה-`.gitignore` כאן כבר חוסם אותו).

---

## מבנה הריפו

```
supabase-guardian-skills/
├── README.md
├── install.ps1                 ← מתקין ל-Windows
├── install.sh                  ← מתקין ל-Mac/Linux
├── LICENSE
└── skills/
    ├── security-code-review/
    │   ├── SKILL.md
    │   └── references/         ← OWASP, Edge Functions, Brevo
    ├── supabase-drive-backup/
    │   ├── SKILL.md
    │   └── assets/            ← backup.mjs, workflow, package.json
    └── supabase-keep-alive/
        └── SKILL.md
```
