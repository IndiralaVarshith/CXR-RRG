#!/usr/bin/env bash
# One-time setup for CXR-RRG on an Ubuntu 22.04/24.04 server (Oracle Cloud Always Free ARM VM).
#   bash setup.sh
# Safe to re-run: it updates the code and rebuilds.
set -euo pipefail

REPO=https://github.com/IndiralaVarshith/CXR-RRG.git
DIR=$HOME/CXR-RRG
ENVF=$DIR/deploy/oracle/.env

echo "==> Installing Docker (from Ubuntu's own packages)"
sudo apt-get update -y
sudo apt-get install -y docker.io docker-compose-v2 git iptables-persistent netfilter-persistent
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true

echo "==> Opening ports 80 and 443 in the server firewall"
for p in 80 443; do
  sudo iptables -C INPUT -p tcp --dport $p -m state --state NEW -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 5 -p tcp --dport $p -m state --state NEW -j ACCEPT
done
sudo netfilter-persistent save

echo "==> Getting the code"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi

if [ ! -f "$ENVF" ]; then
  echo "==> First-time configuration"
  read -rp "Server public IP address (from the Oracle console): " IP
  read -rsp "MongoDB Atlas connection string (input hidden): " MONGO; echo
  read -rp "Doctor account email (optional, Enter to skip): " DEMAIL
  DPASS=""
  if [ -n "$DEMAIL" ]; then read -rsp "Doctor account password (input hidden): " DPASS; echo; fi
  umask 077
  cat > "$ENVF" <<CONF
SITE_ADDRESS=${IP//./-}.sslip.io
MONGO_URI=$MONGO
JWT_SECRET=$(openssl rand -hex 32)
DOCTOR_EMAIL=$DEMAIL
DOCTOR_PASSWORD=$DPASS
CONF
  echo "    saved $ENVF (readable only by you)"
fi

echo "==> Building and starting (first build takes ~10-15 minutes)"
cd "$DIR/deploy/oracle"
sudo docker compose --env-file .env up -d --build

SITE=$(grep '^SITE_ADDRESS=' .env | cut -d= -f2)
echo
echo "Done. In 1-2 minutes open:  https://$SITE"
echo "Logs:     cd $DIR/deploy/oracle && sudo docker compose logs -f"
echo "Update:   bash $DIR/deploy/oracle/setup.sh"
