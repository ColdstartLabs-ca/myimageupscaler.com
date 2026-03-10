#!/bin/bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"

cd "$PROJECT_ROOT"
source ./scripts/load-env.sh

WITH_WEBHOOKS=true
if [[ "${1:-}" == "--no-webhooks" ]]; then
  WITH_WEBHOOKS=false
fi

PREFERRED_PORT="${PORT:-${NEXT_DEV_PORT:-3000}}"

find_free_port() {
  local start_port="$1"
  node - "$start_port" <<'EOF'
const net = require('net');

const startPort = Number(process.argv[2]);

function canListen(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

(async () => {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await canListen(port)) {
      process.stdout.write(String(port));
      return;
    }
  }

  process.stderr.write(`Could not find a free port starting at ${startPort}\n`);
  process.exit(1);
})();
EOF
}

DEV_PORT="$(find_free_port "$PREFERRED_PORT")"
export PORT="$DEV_PORT"

if [[ "$DEV_PORT" != "$PREFERRED_PORT" ]]; then
  echo "⚠️ Port $PREFERRED_PORT is in use, using port $DEV_PORT for both Next.js and Stripe webhooks."
else
  echo "✅ Using port $DEV_PORT for both Next.js and Stripe webhooks."
fi

if [[ "$WITH_WEBHOOKS" == true ]]; then
  concurrently \
    -n next,stripe \
    -c cyan,yellow \
    "next dev --port $DEV_PORT" \
    "stripe listen --api-key $STRIPE_SECRET_KEY --forward-to localhost:$DEV_PORT/api/webhooks/stripe"
else
  exec next dev --port "$DEV_PORT"
fi
