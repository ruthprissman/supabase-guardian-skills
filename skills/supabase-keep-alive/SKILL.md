---
name: supabase-keep-alive
description: מונע הקפאה של פרויקט Supabase חינמי — יוצר טבלת heartbeat + GitHub Actions workflow שכותב אליה כל 3 ימים עם service role key, ומגן על ה-workflow עצמו מהשבתה של GitHub אחרי 60 יום. להפעיל בכל הקמת פרויקט Supabase חדש על תכנית חינמית.
version: 2.0.0
user-invocable: true
---

## למה זה נחוץ — שתי בעיות, לא אחת

פרויקטים "מוגנים" עם keep-alive עדיין קפאו. הסיבה: יש **שתי** נקודות כשל, ורוב הפתרונות מטפלים רק בראשונה.

### בעיה 1 — Supabase מקפיא אחרי 7 ימים ללא פעילות DB
- Supabase בתכנית החינמית מקפיא פרויקט אחרי ~7 ימים בלי **פעילות בסיס נתונים אמיתית**.
- פעילות פנימית (pg_cron) **לא** נחשבת — צריך בקשה שמגיעה ל-DB מבחוץ.
- **זה לא עניין של "להיראות אנושי"** — Supabase לא בודק User-Agent או דפדפן. הוא סופר האם ה-DB קיבל שאילתות. שאילתה אחת אמיתית ליום מספיקה.
- כתיבה (INSERT/UPDATE) היא הכי חד-משמעית. קריאה שנחסמת ע"י RLS ומחזירה ריק — עמומה. לכן **כותבים** לטבלה ייעודית עם **service role key** (עוקף RLS).

### בעיה 2 — GitHub משבית את ה-workflow אחרי 60 יום ⚠️ (הרוצח השקט)
- GitHub **משבית אוטומטית כל scheduled workflow** ברפו שלא קיבל **קומיט** במשך 60 יום.
- רק **קומיטים** מאפסים את הטיימר — **לא** ריצות של ה-workflow, לא tags, לא releases, לא issues.
- בפרויקט רדום (בלי פיתוח חודשיים) ה-cron מושבת בשקט → כ-7 ימים אחר כך Supabase מקפיא.
- **זו הסיבה שפרויקטים קפאו למרות keep-alive.** הפינג לא "לא הרשים מספיק" — הוא פשוט הפסיק לרוץ.
- הפתרון: כשהרפו שקט, ה-workflow דוחף לעצמו empty-commit קטן כדי לאפס את הטיימר.

---

## מה ליצור — 2 חלקים

### חלק א' — טבלת ה-heartbeat

הריצו את ה-SQL הבא ב-Supabase SQL Editor (או כמיגרציה חדשה בתיקיית `supabase/migrations/` אם הפרויקט משתמש בכאלה):

```sql
create table if not exists public.keep_alive (
  id smallint primary key default 1,
  pinged_at timestamptz not null default now(),
  constraint keep_alive_singleton check (id = 1)
);

insert into public.keep_alive (id, pinged_at)
values (1, now())
on conflict (id) do nothing;

-- RLS מופעל בלי policies: רק service_role (שעוקף RLS) ניגש. אין נתוני משתמש.
alter table public.keep_alive enable row level security;
```

### חלק ב' — ה-workflow

צרו את `.github/workflows/keep-alive.yml` בשורש הפרויקט:

```yaml
name: Keep Supabase Alive

# מונע הקפאה של פרויקט Supabase חינמי — פותר שתי בעיות:
#   1. Supabase מקפיא אחרי ~7 ימים ללא פעילות DB → כותבים שורת heartbeat אמיתית.
#   2. GitHub משבית scheduled workflow אחרי 60 יום ללא קומיט → דוחפים empty-commit
#      קטן כשהרפו שקט (רק קומיטים מאפסים את הטיימר של GitHub).
#
# דורש שני GitHub Secrets: SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY.

on:
  schedule:
    - cron: '0 8 */3 * *'  # כל 3 ימים בשעה 8:00 UTC (מרווח בטוח מתחת ל-7 ימים)
  workflow_dispatch:

permissions:
  contents: write            # נדרש כדי לדחוף את ה-keepalive commit

jobs:
  keep-alive:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Write DB heartbeat (real database activity)
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          curl -sf -X POST "$SUPABASE_URL/rest/v1/keep_alive?on_conflict=id" \
            -H "apikey: $SERVICE_KEY" \
            -H "Authorization: Bearer $SERVICE_KEY" \
            -H "Content-Type: application/json" \
            -H "Prefer: resolution=merge-duplicates,return=minimal" \
            -d "{\"id\":1,\"pinged_at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
          echo "✅ DB heartbeat written at $(date -u)"

      - name: Prevent 60-day scheduled-workflow auto-disable
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          LAST=$(git log -1 --format=%ct)
          AGE_DAYS=$(( ( $(date -u +%s) - LAST ) / 86400 ))
          echo "Last commit was $AGE_DAYS day(s) ago"
          if [ "$AGE_DAYS" -ge 50 ]; then
            echo "Repo has been quiet — pushing a keepalive commit"
            git commit --allow-empty -m "chore: keepalive (prevent scheduled-workflow auto-disable)"
            git push
          else
            echo "Recent commit exists — no keepalive commit needed"
          fi
```

> **הערה:** `SUPABASE_URL` אינו סוד (זו כתובת ציבורית) ואפשר גם להטמיע אותה ישירות ב-URL של ה-curl במקום secret. ה-service role key **כן** סוד — תמיד כ-GitHub Secret בלבד.

לאחר יצירת שני החלקים — commit + push.

---

## הוראות ידניות — שלב אחרי שלב

### שלב 1 — יצירת טבלת keep_alive
1. נכנסים ל-Supabase dashboard ← **SQL Editor**
2. מדביקים את ה-SQL מחלק א' ← **Run**

### שלב 2 — מציאת הערכים ל-secrets
מתוך קובץ `.env` של הפרויקט:
- `SUPABASE_URL` — כתובת בסגנון `https://<ref>.supabase.co` (לפעמים בשם `VITE_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` — הערך הארוך שמתחיל ב-`eyJhbGci...` (לפעמים בשם `EXT_SUPABASE_SERVICE_ROLE_KEY`)

### שלב 3 — הוספת ה-secrets ב-GitHub
1. ברפו ב-GitHub: **Settings** ← **Secrets and variables** ← **Actions**
2. **New repository secret**, ומוסיפים **שניים**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

### שלב 4 — בדיקה ידנית
1. ב-GitHub ← **Actions** ← **Keep Supabase Alive**
2. **Run workflow** (ירוק)
3. ממתינים ~20 שניות — אמור להופיע Success, וב-DB השורה ב-`keep_alive` מתעדכנת בזמן חדש.

---

## מה קורה אחר כך

- GitHub מריץ אוטומטית כל 3 ימים — אין צורך בפעולה ידנית.
- כל ריצה **כותבת** ל-DB (מונע הקפאת Supabase) **וגם** מוודאת שהרפו לא עובר 60 יום בלי קומיט (מונע השבתה של GitHub).
- אם ריצה נכשלת — GitHub שולח מייל התראה.
- פוש דרך `GITHUB_TOKEN` **לא** מפעיל workflow מחדש — אין לולאה אינסופית.

---

## הערות ומלכודות

- **למה כתיבה ולא קריאה?** קריאה שנחסמת ע"י RLS מחזירה ריק ועמום אם היא נספרת כפעילות. upsert לטבלת `keep_alive` הוא כתיבה חד-משמעית. בכל מקרה חובה service role key (עוקף RLS).
- **הבעיה של 60 יום היא הקריטית.** keep-alive בלי הצעד הזה ייכשל בשקט בכל פרויקט רדום. אל תשמיטו אותו.
- אם הפרויקט **פעיל** (קומיטים תכופים) — צעד ה-60-יום פשוט לא עושה כלום, לא מזיק.
- ה-service role key הוא **מפתח פרטי** — לעולם לא בקוד, רק כ-GitHub Secret.
- `*/3` בשדה הימים של cron = ימים 1, 4, 7... מרווח בטוח מתחת ל-7 ימים.
- אם פרויקט כבר קפא — צריך לבטל את הקיפאון ידנית מה-Supabase dashboard פעם אחת; מכאן ה-workflow שומר עליו ער.
