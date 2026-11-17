#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 22.04/24.04 server (e.g. AWS EC2) for FWL.
# Does everything in Part B (steps B6-B13) of the deployment guide:
#   swap, Node.js 22, PostgreSQL, Nginx, PM2, database, .env, builds, Nginx site.
#
# Usage, on the server (as the default "ubuntu" user, NOT root):
#   curl -fsSL https://raw.githubusercontent.com/<you>/fwl/main/deploy/setup-server.sh -o setup-server.sh
#   bash setup-server.sh https://github.com/<you>/fwl.git
#
# Safe to re-run: steps that are already done are skipped. Existing database
# passwords and server/.env are kept, never overwritten.

set -euo pipefail

REPO_URL="${1:-}"
APP_DIR="${APP_DIR:-/var/www/fwl}"
DB_NAME="fwl"
DB_USER="fwl"

if [ -z "$REPO_URL" ]; then
  echo "Usage: bash setup-server.sh <git-repo-url>" >&2
  exit 1
fi
if [ "$(id -u)" -eq 0 ]; then
  echo "Run this as your normal user (e.g. ubuntu), not root. It uses sudo where needed." >&2
  exit 1
fi

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

step "1/9 Swap memory (prevents out-of-memory during npm install/build)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  echo "swap already on"
fi

step "2/9 System packages: Node.js 22, PostgreSQL, Nginx, git"
sudo apt-get update -y
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
fi
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs postgresql postgresql-contrib nginx git openssl
node -v

step "3/9 PM2 (keeps the API running)"
command -v pm2 >/dev/null || sudo npm install -g pm2

step "4/9 Get the code into $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER:$USER" "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull origin main
else
  git clone "$REPO_URL" "$APP_DIR"
fi

step "5/9 Database and server/.env"
ENV_FILE="$APP_DIR/server/.env"
if [ ! -f "$ENV_FILE" ]; then
  DB_PASS="$(openssl rand -hex 16)"
  JWT_SECRET="$(openssl rand -hex 32)"
  ADMIN_CODE="$(openssl rand -hex 6)"
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    sudo -u postgres psql -qc "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';"
  else
    sudo -u postgres psql -qc "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
  fi
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
    || sudo -u postgres psql -qc "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
  cat > "$ENV_FILE" <<EOF
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public"
JWT_SECRET="$JWT_SECRET"
PORT=4000
HOST=127.0.0.1
ADMIN_INVITE_CODE="$ADMIN_CODE"
EOF
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE with new random secrets."
else
  echo "$ENV_FILE already exists - keeping it."
fi

step "6/9 Build the API and apply database migrations"
cd "$APP_DIR/server"
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build
# Sample data only on first install (when there is no faculty yet).
if [ "$(sudo -u postgres psql -d "$DB_NAME" -tAc 'SELECT COUNT(*) FROM "Faculty"')" = "0" ]; then
  npm run seed
fi

step "7/9 Start the API with PM2 (and on every reboot)"
pm2 startOrReload ecosystem.config.js
pm2 save
sudo env PATH="$PATH:/usr/bin" "$(command -v pm2)" startup systemd -u "$USER" --hp "$HOME" >/dev/null

step "8/9 Build the client"
cd "$APP_DIR/client"
npm ci
npm run build

step "9/9 Nginx"
sudo cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/fwl
sudo ln -sf /etc/nginx/sites-available/fwl /etc/nginx/sites-enabled/fwl
sudo rm -f /etc/nginx/sites-enabled/default
sudo chmod 755 /var/www "$APP_DIR" "$APP_DIR/client"
sudo nginx -t
sudo systemctl reload nginx

step "Checks"
sleep 2
curl -fsS http://127.0.0.1:4000/api/health && echo "  <- API OK"
curl -fsS -o /dev/null -w "Website via Nginx: HTTP %{http_code}\n" http://127.0.0.1/

PUBLIC_IP="$(curl -fsS --max-time 5 https://checkip.amazonaws.com || echo '<your-server-ip>')"
cat <<EOF

FWL is deployed.
  Open:              http://$PUBLIC_IP
  Admin invite code: run  grep ADMIN_INVITE_CODE $ENV_FILE
  API logs:          pm2 logs fwl-server
EOF
