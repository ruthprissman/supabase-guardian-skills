# Brevo Integration — Security Best Practices

## API Key Management
- אחסן ב-Supabase Secrets (לא ב-.env שחשוף ל-client)
- השתמש רק ב-Edge Functions: `Deno.env.get('BREVO_API_KEY')`
- אל תחשוף ל-client-side code

## בדיקת שליחת תקין (Online Validation)

### ולידציה לפני שליחה:
```typescript
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 254
}

// ולידציה של sender — אל תאפשר override מה-input
const ALLOWED_SENDERS = ['noreply@yourdomain.com', 'support@yourdomain.com']
if (!ALLOWED_SENDERS.includes(senderEmail)) {
  throw new Error('Invalid sender')
}
```

### בדיקת response מ-Brevo:
```typescript
const res = await fetch('https://api.brevo.com/v3/smtp/email', {
  method: 'POST',
  headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})

// בדוק status code
if (res.status === 401) {
  console.error('Brevo: Invalid API key')
  throw new Error('Email service configuration error')
}
if (res.status === 429) {
  console.error('Brevo: Rate limit exceeded')
  throw new Error('Too many requests, please try again later')
}
if (!res.ok) {
  const errText = await res.text()
  console.error('Brevo error:', res.status, errText) // לוג פנימי
  throw new Error('Failed to send email') // לא לחשוף למשתמש
}
```

## Email Injection Prevention
אל תכניס input מהמשתמש ישירות ל-subject / body ללא sanitization:
```typescript
// מסוכן
subject: `Hello ${req.body.name}` // name יכול להכיל header injection

// בטוח
import { escape } from 'html-entities'
subject: `Hello ${escape(req.body.name)}`
```

## Rate Limiting על שליחת מיילים
```typescript
// בדוק ב-DB כמות שליחות לא יותר מX בזמן נתון למשתמש
const { count } = await supabase
  .from('email_log')
  .select('*', { count: 'exact' })
  .eq('user_id', userId)
  .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // שעה אחרונה

if (count && count > 10) {
  return new Response('Too many emails', { status: 429 })
}
```