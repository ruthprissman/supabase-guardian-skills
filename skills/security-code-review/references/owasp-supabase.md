# OWASP Top 10 — בהקשר Supabase

## A01 — Broken Access Control
- **Supabase ספציפי:** טבלה ללא RLS = כל מי שיש לו anon key קורא הכל
- **בדיקה:** `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`
- **תיקון:** `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;` + policies

## A02 — Cryptographic Failures
- אל תאחסן סיסמאות — Supabase Auth עושה את זה
- אל תעביר secrets ב-URL params
- ודא שקריאות API הן HTTPS בלבד

## A03 — Injection
- השתמש תמיד ב-parameterized queries של Supabase client (`.eq()`, `.filter()`)
- אל תבנה SQL strings בעצמך
- ולידציה של email address לפני שליחה ל-Brevo

## A05 — Security Misconfiguration  
- `service_role` key צריך להיות רק בתוך שרת / Edge Functions
- `anon` key מיועד לצד client
- CORS — הגדר whitelist של דומיינים אל תשתמש בכוכבית

## A07 — Authentication Failures
- ודא שכל Edge Function ראשית מאמתת JWT
- Supabase: `const { data: { user } } = await supabase.auth.getUser()`
- אל תסמוך על user ID שמגיע מה-body — קח אותו מה-JWT

## A09 — Security Logging & Monitoring
- לוג שגיאות אבטחה (login failures, unauthorized access)
- אל תכניס נתוני משתמשים ללוגים (emails, passwords, tokens)
- Supabase Logs זמינים ב-Dashboard → Logs
