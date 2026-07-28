# Production secret files

Create this directory on the Linux host outside the Git checkout, owned by the deployment operator
with mode `700`. Create these mode-`600` files with no trailing commentary:

- `postgres_password` — at least 20 random characters;
- `database_url` — `postgresql://USER:URL_ENCODED_PASSWORD@postgres:5432/DATABASE`;
- `resident_bot_token` — the resident BotFather token;
- `staff_bot_token` — the different staff BotFather token;
- `ops_alert_chat_id` — the private Telegram chat that receives host-monitor alerts;
- `backup_passphrase` — at least 24 random characters, held separately from backup artifacts.

Example directory setup:

```bash
sudo install -d -m 700 -o "$USER" -g "$USER" /opt/mahalla-service/secrets
umask 077
openssl rand -base64 36 > /opt/mahalla-service/secrets/postgres_password
openssl rand -base64 48 > /opt/mahalla-service/secrets/backup_passphrase
```

Enter bot tokens and the database URL locally on the host. Never paste them into chat, a ticket,
shell history, Git, screenshots, monitoring labels, or backup metadata. The deployment validator
reports only secret names, never values or paths.
