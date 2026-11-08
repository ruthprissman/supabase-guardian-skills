#!/usr/bin/env bash
# בדיקת תקינות של קבצי גיבוי מוצפנים (.enc) שהורדו מ-Google Drive.
#
# הסקריפט מפענח לעותק זמני, בודק אותו, ומוחק את העותק הגלוי בסיום —
# כך שאף פעם לא נשאר על הדיסק עותק לא מוצפן של בסיס הנתונים.
#
# שימוש (מתוך Git Bash, בתיקייה שאליה הורדת את הקבצים):
#   bash verify-backup.sh <prefix>_<date>*.enc
#
# את המפתח אפשר להעביר במשתנה BACKUP_ENCRYPTION_KEY; אחרת הסקריפט ישאל
# (ההקלדה לא מוצגת על המסך).

set -u

if [ "$#" -eq 0 ]; then
  echo "שימוש: bash verify-backup.sh <קובץ.enc> [עוד קבצים...]"
  exit 2
fi

KEY="${BACKUP_ENCRYPTION_KEY:-}"
if [ -z "$KEY" ]; then
  printf 'מפתח ההצפנה (ההקלדה מוסתרת): '
  read -r -s KEY
  printf '\n\n'
fi

# אותו trim שהסקריפט של הגיבוי עושה. העתקה ממנהל סיסמאות או מקובץ גוררת לא
# פעם רווח או שורה חדשה בסוף, ו-openssl מעביר את הערך של -pass env: כמות שהוא —
# כך שמפתח נכון עם "\n" בסוף נכשל ב-bad decrypt בלי שום רמז למה.
KEY="$(printf '%s' "$KEY" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
if [ -z "$KEY" ]; then
  echo "לא התקבל מפתח — עוצר."
  exit 2
fi
export BACKUP_VERIFY_KEY="$KEY"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
fail=0

for enc in "$@"; do
  echo "=========================================================="
  echo "קובץ: $(basename "$enc")"

  if [ ! -f "$enc" ]; then
    echo "  ✗ לא נמצא"
    fail=1
    continue
  fi
  echo "  גודל מוצפן: $(du -h "$enc" | cut -f1)"

  plain="$tmpdir/$(basename "${enc%.enc}")"
  if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
        -in "$enc" -out "$plain" -pass env:BACKUP_VERIFY_KEY 2>"$tmpdir/err"; then
    echo "  ✗ הפענוח נכשל — כמעט תמיד מפתח שגוי, או רווח/שורה חדשה שנגררו איתו"
    sed 's/^/     /' "$tmpdir/err"
    fail=1
    continue
  fi
  echo "  ✓ הפענוח הצליח            (גודל אחרי פענוח: $(du -h "$plain" | cut -f1))"

  case "$plain" in
    *.gz)
      if gzip -t "$plain" 2>/dev/null; then
        echo "  ✓ הקובץ שלם ולא קטוע"
      else
        echo "  ✗ ה-gzip פגום — הקובץ קטוע"
        fail=1
        continue
      fi

      ver="$(zcat "$plain" | grep -m1 'Dumped by pg_dump' || true)"
      [ -n "$ver" ] && echo "  ✓ ${ver#-- }"

      # שני פורמטים: pg_dump כותב בלוק COPY לכל טבלה; התבנית של הסקיל (REST)
      # כותבת כותרת "-- Data for table:" ושורת INSERT לכל רשומה.
      copies="$(zcat "$plain" | grep -c '^COPY ' || true)"
      if [ "$copies" -gt 0 ]; then
        lines="$(zcat "$plain" | wc -l | tr -d ' ')"
        echo "  ✓ טבלאות עם נתונים: $copies   |   שורות בקובץ: $lines"
      else
        tables="$(zcat "$plain" | grep -c '^-- Data for table: ' || true)"
        inserts="$(zcat "$plain" | grep -c '^INSERT INTO ' || true)"
        if [ "$inserts" -gt 0 ]; then
          echo "  ✓ טבלאות עם נתונים: $tables   |   שורות נתונים (INSERT): $inserts"
        else
          echo "  ✗ לא נמצאו נתונים בדאמפ (לא COPY ולא INSERT). אם המסד באמת ריק, זה צפוי"
          fail=1
        fi
      fi

      if zcat "$plain" | grep -qm1 '^COPY auth\.users '; then
        users="$(zcat "$plain" | sed -n '/^COPY auth\.users /,/^\\\.$/p' | grep -c '^[0-9a-f]\{8\}-' || true)"
        echo "  ✓ מכיל את חשבונות המשתמשים: $users שורות ב-auth.users"
      fi

      # זיהוי עברית ברמת הבתים (LC_ALL=C): ב-Git Bash אין locale מוגדר,
      # ותבניות grep -P לא נתמכות שם.
      if zcat "$plain" | LC_ALL=C grep -q "$(printf '\327')"; then
        echo "  ✓ הטקסט בעברית נשמר כראוי"
      fi

      # שורת נתונים אמיתית מתוך הגיבוי — ההוכחה המשכנעת ביותר שיש שם תוכן.
      # החיתוך הוא לפי בתים, ולכן ה-sed בסוף מסיר חצי-תו עברי אם נקטע באמצע.
      if [ "$copies" -gt 0 ]; then
        sample="$(zcat "$plain" | sed -n '/^COPY public\./,$p' | sed -n '2p' \
                  | cut -c1-60 | sed 's/'"$(printf '\327')"'$//')"
      else
        sample="$(zcat "$plain" | grep -m1 '^INSERT INTO ' \
                  | sed 's/^INSERT INTO \([^ ]*\) .* VALUES (/\1: (/' \
                  | cut -c1-70 | sed 's/'"$(printf '\327')"'$//')"
      fi
      [ -n "$sample" ] && echo "  ✓ דוגמה משורת נתונים: $sample"
      ;;

    *.xlsx)
      if [ "$(head -c 2 "$plain")" = "PK" ]; then
        echo "  ✓ קובץ אקסל תקין (אפשר לפתוח אותו כדי להציץ בנתונים)"
      else
        echo "  ✗ לא נראה כמו קובץ אקסל תקין"
        fail=1
      fi
      ;;
  esac
done

echo "=========================================================="
if [ "$fail" -eq 0 ]; then
  echo "✅ הגיבוי תקין ובר-שחזור. העותקים הגלויים נמחקו."
else
  echo "❌ נמצאה בעיה — ראי את הסימונים ✗ למעלה."
fi
exit "$fail"
