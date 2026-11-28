#!/usr/bin/env bash
# Security checks for the CXR-RRG backend. Creates two throwaway accounts.
#   bash backend/security-test.sh [base-url]        (default http://127.0.0.1:5000)
# Note: uses ~12 auth requests (the auth rate limit is 20 per 15 min per IP).
set -u
B="${1:-http://127.0.0.1:5000}"
T="$(mktemp -d)"
UA1="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
UA2="Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/133.0"
R=$RANDOM$RANDOM
A="qa-a-$R@example.test"; BB="qa-b-$R@example.test"
PW='Str0ng-<script>alert(1)</script>'
J0="{\"name\":\"Alice\",\"email\":\"$A\",\"password\":\"short\"}"
J1="{\"name\":\"<script>alert(1)</script>\",\"email\":\"$A\",\"password\":\"Abcdefg123\"}"
J2="{\"name\":\"Alice Test\",\"email\":\"$A\",\"password\":\"$PW\"}"
J3="{\"name\":\"Bob Test\",\"email\":\"$BB\",\"password\":\"Bobpassword9\"}"
J4="{\"name\":\"Alice\",\"email\":\"$A\",\"password\":\"Abcdefg123\"}"
J5="{\"email\":\"$A\",\"password\":\"$PW\"}"
J7="{\"email\":\"$BB\",\"password\":\"Bobpassword9\"}"
pass=0; fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf "  \033[32mPASS\033[0m %s (%s)\n" "$1" "$3";
  else fail=$((fail+1)); printf "  \033[31mFAIL\033[0m %s (expected %s, got %s) %s\n" "$1" "$2" "$3" "$(head -c 160 $T/body 2>/dev/null)"; fi; }
code() { curl -s -o "$T/body" -w "%{http_code}" "$@"; }
json() { curl -s -H "Content-Type: application/json" "$@"; }

echo "1. Nothing is reachable without signing in"
check "history"          401 "$(code $B/api/history)"
check "AI predict"       401 "$(code -X POST $B/ml/predict)"
check "AI health"        401 "$(code $B/ml/health)"
check "images"           401 "$(code $B/api/images/0123456789abcdef0123456789abcdef)"
check "devices list"     401 "$(code $B/api/auth/sessions)"
check "fake cookie"      401 "$(code -b 'cxr_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' $B/api/auth/me)"

echo "2. Input validation"
check "weak password"    400 "$(code -A "$UA1" -H 'Content-Type: application/json' -d "$J0" $B/api/auth/register)"
check "script as name"   400 "$(code -A "$UA1" -H 'Content-Type: application/json' -d "$J1" $B/api/auth/register)"
check "NoSQL injection login" 401 "$(code -A "$UA1" -H 'Content-Type: application/json' -d '{"email":{"$gt":""},"password":{"$gt":""}}' $B/api/auth/login)"
check "malformed JSON"   400 "$(code -A "$UA1" -H 'Content-Type: application/json' -d '{"email":' $B/api/auth/login)"
check "cross-site POST blocked" 403 "$(code -A "$UA1" -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{}' $B/api/auth/login)"

echo "3. Script in a password is just characters (hashed, never executed or shown)"
check "register A"       201 "$(code -A "$UA1" -c $T/a1 -H 'Content-Type: application/json' -d "$J2" $B/api/auth/register)"
grep -q "alert" "$T/body" && check "password not echoed" no yes || check "password not echoed" no no
check "register B"       201 "$(code -A "$UA1" -c $T/b1 -H 'Content-Type: application/json' -d "$J3" $B/api/auth/register)"
check "duplicate email"  409 "$(code -A "$UA1" -H 'Content-Type: application/json' -d "$J4" $B/api/auth/register)"
check "A signed in"      200 "$(code -A "$UA1" -b $T/a1 $B/api/auth/me)"

echo "4. Cookie flags"
grep -q "#HttpOnly_.*cxr_session" $T/a1 && check "session cookie HttpOnly" yes yes || check "session cookie HttpOnly" yes no
curl -s -A "$UA1" -D $T/h -o /dev/null -H 'Content-Type: application/json' -d "$J5" -c $T/a2 $B/api/auth/login
grep -qi "set-cookie: cxr_session=.*SameSite=Strict" $T/h && check "SameSite=Strict" yes yes || check "SameSite=Strict" yes no

echo "5. Sessions are locked to their device"
cp $T/a2 $T/stolen
check "same device works"       200 "$(code -A "$UA1" -b $T/a2 $B/api/auth/me)"
check "stolen cookie, other browser" 401 "$(code -A "$UA2" -b $T/stolen $B/api/auth/me)"
check "...and that session is now dead" 401 "$(code -A "$UA1" -b $T/a2 $B/api/auth/me)"
grep -v cxr_device $T/a1 > $T/nodevice
check "session cookie without device cookie" 401 "$(code -A "$UA1" -b $T/nodevice $B/api/auth/me)"
check "original device A still fine?" 401 "$(code -A "$UA1" -b $T/a1 $B/api/auth/me)"   # revoked above (no device cookie = stolen)

echo "6. Multiple devices, each with its own session"
check "A on Mac"     200 "$(code -A "$UA1" -c $T/mac -H 'Content-Type: application/json' -d "$J5" $B/api/auth/login)"
check "A on Windows" 200 "$(code -A "$UA2" -c $T/win -H 'Content-Type: application/json' -d "$J5" $B/api/auth/login)"
n=$(curl -s -A "$UA1" -b $T/mac $B/api/auth/sessions | python3 -c "import sys,json;print(len(json.load(sys.stdin)['sessions']))")
check "A sees 2 devices" 2 "$n"
curl -s -A "$UA1" -b $T/mac $B/api/auth/sessions | grep -q "qa-b-" && check "no other user's data in list" no yes || check "no other user's data in list" no no
WIN_ID=$(curl -s -A "$UA2" -b $T/win $B/api/auth/sessions | python3 -c "import sys,json;print([s['id'] for s in json.load(sys.stdin)['sessions'] if s['current']][0])")

echo "7. Users can't touch each other's data"
IMG="$(mktemp -d)/x.png"; python3 -c "import base64;open('$IMG','wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='))"
check "A saves a report" 201 "$(code -A "$UA1" -b $T/mac -F "image=@$IMG;type=image/png" --form-string 'patientName=<img src=x onerror=alert(1)>' --form-string 'aiData={"probabilities":{"Effusion":0.7,"$where":1},"risk":"high"}' $B/api/save-report)"
RID=$(python3 -c "import json;print(json.load(open('$T/body'))['report']['_id'])")
KEY=$(python3 -c "import json;print(json.load(open('$T/body'))['report']['imageKey'])")
python3 -c "import json;p=json.load(open('$T/body'))['report']['aiReport']['probabilities'];print('ok' if '\$where' not in p else 'bad')" | grep -q ok && check "junk AI fields dropped" yes yes || check "junk AI fields dropped" yes no
check "A sees own image"       200 "$(code -A "$UA1" -b $T/mac $B/api/images/$KEY)"
check "B can't see A's image"  404 "$(code -A "$UA1" -b $T/b1 $B/api/images/$KEY)"
check "B can't edit A's report"   404 "$(code -A "$UA1" -b $T/b1 -X PUT -H 'Content-Type: application/json' -d '{"notes":"hacked"}' $B/api/history/$RID)"
check "B can't delete A's report" 404 "$(code -A "$UA1" -b $T/b1 -X DELETE $B/api/history/$RID)"
curl -s -A "$UA1" -b $T/b1 $B/api/history | grep -q "$RID" && check "A's report absent from B's history" no yes || check "A's report absent from B's history" no no
check "B can't sign out A's device" 404 "$(code -A "$UA1" -b $T/b1 -X DELETE $B/api/auth/sessions/$WIN_ID)"
check "B isn't a doctor"       403 "$(code -A "$UA1" -b $T/b1 $B/api/reports)"
check "fake (text) image rejected" 400 "$(code -A "$UA1" -b $T/mac -F "image=@/etc/hosts;type=image/png" $B/api/save-report)"

echo "8. Sign out other devices / logout"
check "A: sign out others"   200 "$(code -A "$UA1" -b $T/mac -X POST $B/api/auth/sessions/revoke-others)"
check "Windows session ended" 401 "$(code -A "$UA2" -b $T/win $B/api/auth/me)"
check "Mac still signed in"  200 "$(code -A "$UA1" -b $T/mac $B/api/auth/me)"
check "logout"               200 "$(code -A "$UA1" -b $T/mac -X POST $B/api/auth/logout)"
check "after logout"         401 "$(code -A "$UA1" -b $T/mac $B/api/auth/me)"

echo "9. Brute force: 5 wrong passwords lock the account"
for i in 1 2 3 4 5; do J6="{\"email\":\"$BB\",\"password\":\"wrong$i\"}"; curl -s -o /dev/null -A "$UA1" -H 'Content-Type: application/json' -d "$J6" $B/api/auth/login; done
check "6th attempt (even correct) is locked" 423 "$(code -A "$UA1" -H 'Content-Type: application/json' -d "$J7" $B/api/auth/login)"

echo "10. Security headers"
curl -s -D $T/hh -o /dev/null $B/api/health
for h in content-security-policy x-frame-options x-content-type-options referrer-policy permissions-policy; do
  grep -qi "^$h:" $T/hh && check "$h" yes yes || check "$h" yes no; done
grep -qi "^x-powered-by" $T/hh && check "x-powered-by hidden" yes no || check "x-powered-by hidden" yes yes

echo; echo "RESULT: $pass passed, $fail failed"
echo "$A $BB" > "$T/accounts"; echo "Test accounts: $A, $BB"
[ $fail -eq 0 ]
