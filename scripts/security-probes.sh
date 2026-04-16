#!/usr/bin/env bash
set -euo pipefail
PORT="${1:?usage: $0 <port>}"

# Probe 1: 127.0.0.1 bind only — verify server is NOT listening on 0.0.0.0 or all interfaces.
# On macOS, curl http://0.0.0.0:PORT routes to loopback even when server binds to 127.0.0.1 only,
# so we check the bind address via lsof (macOS) or ss (Linux) rather than curl.
if command -v lsof &>/dev/null; then
  bind_addr=$(lsof -iTCP:"$PORT" -sTCP:LISTEN -P -n 2>/dev/null | awk 'NR>1 {print $9}' | head -1)
  if [[ "$bind_addr" == "0.0.0.0:$PORT" || "$bind_addr" == "*:$PORT" || "$bind_addr" == ":::$PORT" ]]; then
    echo "FAIL: server is bound to all interfaces ($bind_addr), not 127.0.0.1 only"; exit 1
  fi
elif command -v ss &>/dev/null; then
  if ss -tlnp | grep -q "0.0.0.0:$PORT\|:::$PORT"; then
    echo "FAIL: server is bound to all interfaces, not 127.0.0.1 only"; exit 1
  fi
else
  # Fallback: try curl and treat ECONNREFUSED as pass (Linux behavior)
  if curl -s --max-time 2 "http://0.0.0.0:$PORT/" >/dev/null 2>&1; then
    echo "FAIL: 0.0.0.0 reachable"; exit 1
  fi
fi

# Probe 2: Missing token → 403 on a protected endpoint
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/events?session=test")
[[ "$code" == "403" ]] || { echo "FAIL: missing token got $code (want 403)"; exit 1; }

# Probe 3: Forged Host → 400 (DNS rebinding defense)
code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: evil.com' "http://127.0.0.1:$PORT/")
[[ "$code" == "400" ]] || { echo "FAIL: forged Host got $code (want 400)"; exit 1; }

# Probe 4: CSP header present on GET /
csp=$(curl -sI "http://127.0.0.1:$PORT/" | grep -i 'content-security-policy' || true)
[[ -n "$csp" ]] || { echo "FAIL: no CSP header"; exit 1; }

echo "OK"
