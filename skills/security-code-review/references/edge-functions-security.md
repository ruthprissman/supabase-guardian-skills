# Edge Functions Security — Supabase

## תבנית בסיסית לפונקציה מאובטחת

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // 1. CORS headers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': 'https://yourdomain.com', // לא *
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    // 2. Auth validation
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401 })
    }

    // 3. יצירת client עם token של המשתמש (לא service_role!)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // 4. קבלת המשתמש מהטוקן
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 })
    }

    // 5. Input validation
    const body = await req.json()
    if (!body.email || typeof body.email !== 'string') {
      return new Response('Invalid input', { status: 400 })
    }

    // 6. לוגיקה עסקית...

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Function error:', error.message) // לוג פנימי
    return new Response('Internal Server Error', { status: 500 }) // לא לחשוף למשתמש
  }
})
```

## Secrets — מה מותר ומה אסור

| ✅ מותר | ❌ אסור |
|---------|---------|
| `Deno.env.get('KEY')` | `const KEY = 'actual-key-value'` |
| Supabase Secrets | `.env` file בגיט |
| Environment variables | Hard-coded בקוד |

## Service Role Key — מתי מותר
`service_role` מבטל את כל ה-RLS policies. השתמש רק כשצריך:
- פעולות admin שמכוונות לעקוף RLS
- רק ב-Edge Functions, אל תחשוף ל-client
- תמיד מ-`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`

## בדיקת JWT — הכלל הזהב
```typescript
// ✅ נכון — קח user מ-JWT
const { data: { user } } = await supabase.auth.getUser()
const userId = user.id

// ❌ שגוי — אל תסמוך על userId מה-body
const { userId } = await req.json() // משתמש יכול לזייף את הערך
```
