# 🛡️ Supabase Guardian Skills

שלושה **Agent Skills** (בפורמט הפתוח `SKILL.md` — עובד ב-Claude Code, Codex CLI ועוד) שמגנים על פרויקט Supabase — אבטחה, גיבוי, ומניעת הקפאה.
מיועדים בעיקר לפרויקטים על התוכנית החינמית (free tier) של Supabase, שבה אין גיבויים מובנים והפרויקט קופא אחרי חוסר פעילות.

זמין גם כ-**Claude Code Plugin** רשמי — התקנה בשתי פקודות, ראו למטה.

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

- **[Claude Code](https://claude.com/claude-code)** או **[Codex CLI](https://developers.openai.com/codex)** מותקן (הסקילים רצים בתוכם).
- פרויקט **Supabase** (הסקילים מכוונים ל-Supabase + Edge Functions).
- ל-backup ול-keep-alive: ריפו ב-**GitHub** עם הרשאת **Admin** (בשביל Secrets ו-Actions).

---

## התקנה

### אפשרות א' — Claude Code Plugin (הכי מהיר, מומלץ)

בתוך Claude Code:

```
/plugin marketplace add ruthprissman/supabase-guardian-skills
/plugin install supabase-guardian@supabase-guardian
```

זהו — שלושת הסקילים נטענים אוטומטית וזמינים כ-`/supabase-guardian:security-code-review` וכו' (וגם מזוהים בשמם הרגיל, למשל "תעשה security review"). לעדכון גרסה: `/plugin update supabase-guardian`.

### אפשרות ב' — סקריפט התקנה (Claude Code + Codex CLI)

מתאים גם למי שרוצה את הסקילים כ-Skills רגילים בלי מנגנון הפלאגין, וגם למי שעובד עם **Codex CLI** (שקורא את אותו פורמט `SKILL.md`). הסקריפט מזהה אוטומטית אם יש אצלכם `~/.claude` ו/או `~/.codex` ומתקין לשניהם.

**Windows (PowerShell):**
```powershell
git clone https://github.com/ruthprissman/supabase-guardian-skills.git
cd supabase-guardian-skills
.\install.ps1
```

**Mac / Linux:**
```bash
git clone https://github.com/ruthprissman/supabase-guardian-skills.git
cd supabase-guardian-skills
chmod +x install.sh && ./install.sh
```

**אתחלו את הסוכן** (Claude Code / Codex) אחרי ההתקנה כדי שהסקילים ייטענו.

### אפשרות ג' — התקנה ידנית

העתיקו את שלוש התיקיות שמתחת ל-`skills/` לתוך תיקיית הסקילים של הסוכן שלכם:

```
~/.claude/skills/security-code-review/      (Claude Code)
~/.codex/skills/security-code-review/       (Codex CLI)
... וכן הלאה לשלושת הסקילים
```

### לבדוק שזה עבד

פתחו את הסוכן והקלידו `/` — שלושת הסקילים אמורים להופיע ברשימה. או פשוט בקשו "תעשה security review" והסקיל יתחיל לעבוד.

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
├── install.ps1                 ← מתקין ל-Windows (Claude Code + Codex)
├── install.sh                  ← מתקין ל-Mac/Linux (Claude Code + Codex)
├── LICENSE
├── .claude-plugin/
│   ├── plugin.json             ← מניפסט הפלאגין
│   └── marketplace.json        ← מאפשר /plugin marketplace add על הריפו הזה
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
