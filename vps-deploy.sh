#!/bin/bash
set -e

VPS_USER="root"
VPS_HOST="your-vps-ip"
VPS_DIR="/root/openagents"
SSH_KEY="~/.ssh/id_rsa"

echo "=== Deploying to VPS ==="

ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" bash <<EOF
  set -e
  cd "$VPS_DIR"
  echo "--- Pulling latest code ---"
  git pull origin main
  echo "--- Installing dependencies ---"
  pnpm install --frozen-lockfile
  echo "--- Building shared package ---"
  pnpm --filter @openagents/shared build
  echo "--- Deploying with Docker ---"
  node scripts/prod-stack.mjs deploy
  echo "--- Done ---"
EOF

echo "=== Deploy complete ==="
