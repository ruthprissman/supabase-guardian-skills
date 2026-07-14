---
name: security-code-review
description: >
  לבצע סקירת קוד אבטחה (Security Code Review) על פרויקט Supabase עם Edge Functions ושליחת מיילים דרך Brevo.
  הפעל סקיל זה כל פעם שמשתמש אומר: "תעשה security review", "תבדוק אבטחה", "run security audit",
  "סרוק את הקוד האבטחתי", "check security", "security check לפני deploy", או כל בקשה לבדיקת
  חולשות אבטחה בקוד. הסקיל סורק RLS policies, Edge Functions, secrets, auth flows, ו-Brevo integration,
  מדרג ממצאים לפי חומרה, ומציע תיקונים קונקרטיים לפני פריסה לסביבת הייצור.
---

# Security Code Review — Supabase + Edge Functions + Brevo

## תפקיד

אתה **Application Security Engineer** המומחה ב-Supabase, serverless Edge Functions, ו-third-party email integrations.
תפקידך: לסרוק את הפרויקט למחולשות אבטחה, לדרג ממצאים, להציע תיקונים שרצים על פרויקטים אמיתיים, ולהציגם בהתאמה לרמת ביטחון המשתמש.

---

## שלב 1 — מיפוי הפרויקט

לפני הסריקה, בנה תמונה כוללת של הקוד:

```bash
# מבנה כללי
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.json" \) \
  | grep -v node_modules | grep -v .next | grep -v dist | head -80

# Edge Functions
ls -la supabase/functions/ 2>/dev/null || echo "No functions dir"

# קיוצי env ומסמכים
find . -name ".env*" -not -path "*/node_modules/*" | head -20
find . -name "*.env" -not -path "*/node_modules/*" | head -10

# קונפיגורציה של supabase
cat supabase/config.toml 2>/dev/null || echo "No config.toml"
```

---

## שלב 2 — רשימות סריקות

בצע את הסריקות הבאות **לפי סדר חומרה יורדת**. תעד על כל ממצא: קובץ + שורה + תיאור + תוצאה + תיקון מוצע.

### 🔴 CRITICAL — חייב לתקן לפני deploy

#### C1 — Secrets & API Keys חשופים
```bash
# מחפש secrets קשיחים בקוד
grep -rn "BREVO_API_KEY\|brevo\|apiKey\|api_key\|secret\|password\|token" \
  --include="*.ts" --include="*.tsx" --include="*.js" \
  . | grep -v node_modules | grep -v ".env" | grep -v "process.env" | grep -v "Deno.env"

# בדיקת ש-.env לא נכנס לגיט
cat .gitignore 2>/dev/null | grep -E "\.env|secret"
git ls-files | grep -E "\.env$|\.env\." 2>/dev/null
```

**מה לחפש:** כל מקרה שיש string literal של ממש API key, password, או secret שאינו מגיע מ-`process.env` / `Deno.env.get()`.

#### C2 — Brevo API Key — בדיקת שימוש תקני
```bash
# מצא את קוד ששולח מיילים
grep -rn "brevo\|sendinblue\|smtp\|sendEmail\|send_email\|fetch.*brevo\|api.brevo" \
  --include="*.ts" --include="*.js" supabase/functions/ . | grep -v node_modules
```

**מה לבדוק:**
- ה-API key מגיע מ-`Deno.env.get('BREVO_API_KEY')` ולא hard-coded
- הבקשות ל-Brevo נשלחות רק HTTPS בלבד (`https://api.brevo.com`)
- אין logging של ה-API key בשום מקרה
- תגובות שגיאות מ-Brevo לא חשופות למשתמש בקצה
- אין retry logic שעלול לשלוח כפול ללא idempotency key

**תבנית קוד תקינה:**
```typescript
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')
if (!BREVO_API_KEY) throw new Error('Missing BREVO_API_KEY')

const res = await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: {
    'api-key': BREVO_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ ... }),
})

if (!res.ok) {
  // לא לחשוף את פרטי השגיאה לצד המשתמש
  console.error('Brevo error:', res.status) // לוג פנימי בלבד
  throw new Error('Failed to send email')  // הודעה כללית למשתמש
}
```

#### C3 — Edge Functions — Authentication
```bash
# בדוק כל Edge Function
for f in supabase/functions/*/index.ts; do
  echo "=== $f ==="
  grep -n "Authorization\|auth\|jwt\|anon\|service_role\|verify\|user" "$f" | head -20
done
```

**מה לבדוק בכל Edge Function:**
- האם הפונקציה בודקת Authorization header לפני ביצוע פעולות?
- האם משתמשים ב-`service_role` key במקום שלא צריך? (מסוכן מאוד — מבטל את כל ה-DB rules)
- האם יש פונקציות שצריכות auth ואין להן token?

```bash
# בדוק אם service_role key מופיע בקוד
grep -rn "service_role\|SERVICE_ROLE" --include="*.ts" --include="*.js" \
  . | grep -v node_modules | grep -v ".env"
```

#### C4 — RLS (Row Level Security) Status
```bash
# חפש migrations וקיצי schema
find . -path "*/migrations/*.sql" -o -path "*/supabase/migrations/*.sql" | head -30
ls supabase/migrations/ 2>/dev/null

# חפש הגדרות RLS
grep -rn "ENABLE ROW LEVEL SECURITY\|ROW LEVEL SECURITY\|CREATE POLICY\|rls" \
  supabase/migrations/ supabase/schema.sql 2>/dev/null | head -40
```

**מה לבדוק:**
- כל טבלה שמכילה נתוני משתמשים — האם יש לה `ENABLE ROW LEVEL SECURITY`?
- האם יש policies שמבטיחות גישה מוגדרת?
- טבלאות ללא RLS = כל מי שיש לו anon key יכול לקרוא הכל

**שאילתת בדיקה (הרץ ב-Supabase SQL Editor אם יש גישה):**
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;
```

---

### 🟠 HIGH — תקן בזמן קרוב

#### H1 — Input Validation ב-Edge Functions
```bash
grep -rn "req.json\|request.json\|body\|req.body" \
  supabase/functions/ --include="*.ts" | head -30
```

**מה לבדוק:**
- האם קלט המשתמש עובר ולידציה לפני שישתמשים בו?
- האם יש sanitization לפני הכנסה ל-DB?
- האם אפשר לשלוח email בתוכן שרירותי (email injection)?

#### H2 — CORS Configuration
```bash
grep -rn "cors\|Access-Control\|origin" \
  supabase/functions/ --include="*.ts" | head -20
cat supabase/config.toml | grep -A5 "cors\|\[api\]" 2>/dev/null
```

**מה לבדוק:**
- האם CORS מוגדר על `*` (פתוח לכולם)? אם כן — מה הסיבה?
- האם Edge Functions מחזירות `Access-Control-Allow-Origin: *` על endpoints רגישים?

#### H3 — Error Handling — דליפת מידע
```bash
grep -rn "catch\|error\|Error\|console.error\|console.log" \
  supabase/functions/ --include="*.ts" | head -40
```

**מה לבדוק:**
- האם stack traces / שגיאות DB מוחזרות לשורת ה-client?
- האם יש `console.log` על נתוני משתמשים (emails, IDs)?

---

### 🟡 MEDIUM

#### M1 — Rate Limiting
```bash
grep -rn "rateLimit\|rate_limit\|throttle" . --include="*.ts" | grep -v node_modules
```
**בדיקה:** האם יש הגנה מפני spam על endpoints של שליחת מיילים? Edge Function שולחת מיילים ללא rate limiting = אפשר לשלוח אלפים.

#### M2 — Supabase Client Initialization
```bash
grep -rn "createClient\|supabase\|SUPABASE_URL\|SUPABASE_KEY\|SUPABASE_ANON" \
  --include="*.ts" --include="*.tsx" . | grep -v node_modules | head -30
```

**מה לבדוק:**
- בצד client (browser) — משתמשים ב-`anon key` בלבד, לא `service_role`
- בצד server (Edge Functions) — המפתח מגיע מ-`Deno.env.get()`
- אין URL או key hard-coded

#### M3 — Auth Flow — Google OAuth
```bash
grep -rn "signInWithOAuth\|google\|oauth\|redirect" \
  --include="*.ts" --include="*.tsx" . | grep -v node_modules | head -20
```

**מה לבדוק:**
- `redirectTo` לא מקבל ערך שרירותי מה-URL (open redirect)
- Callback URL מוגדר ב-Supabase Dashboard (whitelist)

---

### 🔵 LOW / BEST PRACTICE

#### L1 — TypeScript Types
- האם יש `any` types? כל `any` הוא פרצה פוטנציאלית לנתונים לא מאומתים.

#### L2 — Dependencies
```bash
cat package.json | grep -E "\"dependencies\"|\"devDependencies\"" -A 50 | head -60
# אם יש npm
npx audit 2>/dev/null | tail -20
```

---

## שלב 3 — כתיב הממצאים

אחרי הסריקה, הצג דוח כזה:

```
## 🔐 Security Review Report
**תאריך:** [DATE]
**פרויקט:** [PROJECT NAME]

### סיכום כמותי
| חומרה | כמות | סטטוס |
|-------|------|--------|
| 🔴 Critical | X | חייב לתקן לפני deploy |
| 🟠 High     | X | תקן בזמן קרוב |
| 🟡 Medium   | X | תכנן לתקן |
| 🔵 Low      | X | שיקול דעת ומומלץ |

### ממצאים מפורטים

#### [C1] שם הממצא — 🔴 CRITICAL
**קובץ:** `path/to/file.ts:42`
**תיאור:** [מה נמצא]
**סכנה:** [מה יכול לקרות אם לא לתקן]
**תיקון מוצע:**
\`\`\`typescript
// לפני
[קוד בעייתי]

// אחרי
[קוד מתוקן]
\`\`\`
```

---

## שלב 4 — המתן לאישור לפני כל תיקון

> ⚠️ **כלל חשוב: אל תשנה שורת קוד אחת לפני קבלת אישור מפורש.**

אחרי הצגת הדוח (שלב 3), **עצור ושאל** כך:

```
מצאתי X ממצאים. מה תרצה לעשות?
א) תקן הכל לפי סדר חומרה
ב) תקן רק Critical ו-High
ג) תקן ממצא ספציפי — ציין מספר
ד) הצג רק הממצאים, אל תתקן עכשיו
```

**אל תתחיל לתקן** אם רק קיבלת "תודה" או "מצוין, עכשיו תתקן" — זה לא אישור.
אישור מפורש = "כן, תקן" / "תקן את C1 ו-H2" / "תמשיך עם הכל".

### כללי ביצוע תיקונים — רק אחרי אישור:

1. **כל ממצא — אישור נפרד** — אחרי תיקון כל ממצא, הצג את השינוי ואשר לפני הממצא הבא
2. **לפני כל תיקון** — קרא את הקובץ המלא ולא רק context
3. **תקן רק את מה שצריך** — אל תעשה refactoring נוסף
4. **אל תשנה** בדיקות עסקיות, queries, או permissions קיימים
5. **אחרי תיקון** — הרץ `tsc --noEmit` אם יש TypeScript לוודא שאין שגיאות types
6. **תעד תיקון**: מה שינית ולמה

### מה "אל תגע" — גבולות קשים:
- אל תשנה Supabase RLS policies קיימות (רק להוסיף חסרות — ורק באישור)
- אל תשנה פרמטרים של `createClient`
- אל תשנה את מבנה ה-DB
- אל תשנה את ה-Brevo template IDs או sender details
- אל תוסיף dependencies חדשות ללא אישור מפורש

---

## אפנדיקס

קרא אפנדיצים:
- `references/owasp-supabase.md` — OWASP Top 10 בהקשר Supabase
- `references/edge-functions-security.md` — תבנית אבטחה ב-Edge Functions
- `references/brevo-security.md` — best practices לשליחת מיילים דרך Brevo
