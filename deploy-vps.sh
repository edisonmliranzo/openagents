#!/bin/bash
set -e

DOMAIN="openagents.us"
APP_PORT=4300

echo "=== Step 1: Update packages ==="
sudo apt update

echo "=== Step 2: Install Nginx + Certbot ==="
sudo apt install -y nginx certbot python3-certbot-nginx

echo "=== Step 3: Create Nginx config ==="
sudo tee /etc/nginx/sites-available/openagents > /dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    location / {
        proxy_pass http://localhost:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

echo "=== Step 4: Enable site ==="
sudo ln -sf /etc/nginx/sites-available/openagents /etc/nginx/sites-enabled/openagents

# Remove default site if it exists to avoid conflicts
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx

echo "=== Step 5: Obtain SSL certificate ==="
sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos --email edison0220@gmail.com

echo ""
echo "Done! Your app should be live at https://${DOMAIN}"
echo "Make sure your app is running on port ${APP_PORT}"
