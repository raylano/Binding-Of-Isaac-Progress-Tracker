# Deployment

BasementDiary runs in one Docker container (`boipt`) on a Linux server. The container
listens on port 8080; Docker publishes it only on **127.0.0.1:8090**, with nginx serving
HTTPS in front. `https://your-domain.example` below is a placeholder: set your real origin
with `PUBLIC_URL` in `.env`; the Sync page then shows players the right `-Server` command.

Requirements: Linux, Docker with the Compose plugin, nginx, certbot, a domain, and git.

---

## 1. DNS (once)

Create an A record for the host you want players to use (replace the DNS provider's Name/Host
field with the appropriate subdomain or `@`):

| Name / Host | Type | Value |
|---|---|---|
| your chosen hostname | A | the server's public IPv4 address |

Add an AAAA record only if the server is reachable over IPv6. After DNS has propagated,
verify the chosen hostname resolves with `getent ahosts your-domain.example`.

---

## 2. Repository and settings (once)

```bash
git clone https://github.com/raylano/BOIPT.git ~/BOIPT && cd ~/BOIPT
```

> **Private repo?** Add a deploy key (GitHub → repo → *Settings → Deploy keys*) and
> clone with `git@github.com:raylano/BOIPT.git`.

Create `.env` from the template and restrict it to your user:

```bash
cp .env.example .env && chmod 600 .env
nano .env
```

Set at least:

```
PORT=8090
PUBLIC_URL=https://your-domain.example
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=
TRUST_PROXY=1
```

Set `ADMIN_EMAIL` to an address you control. Before the first start, put a unique password
of at least 12 characters in `ADMIN_PASSWORD`. This is a one-time bootstrap secret: never
commit it, and remove it from `.env` after the admin account is created.

`PORT` controls the host port bound to loopback. `STEAM_API_KEY` is optional. Compose passes
`PUBLIC_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `STEAM_API_KEY`, and `TRUST_PROXY` into the
container; nothing else from `.env` reaches it. Never commit `.env`.

---

## 3. First start and admin account

```bash
docker compose up -d --build
```

Check that it runs and created the admin account:

```bash
docker compose ps
curl -fsS http://127.0.0.1:8090/api/health
docker compose logs --tail 20
```

On a fresh data directory, the log should show `Admin account created for ADMIN_EMAIL.`

Now remove the one-time password: empty `ADMIN_PASSWORD=` in `.env`, then recreate the
container so the value is gone from its environment as well:

```bash
nano .env
docker compose up -d
```

If the log says the password was rejected (too short, one repeated character, or equal
to the email address), fix `ADMIN_PASSWORD` and run `docker compose up -d` again.

---

## 4. nginx and HTTPS

Create `/etc/nginx/sites-available/your-domain.example`:

```nginx
# Second layer of rate limiting, on top of the limits in the app itself.
limit_req_zone $binary_remote_addr zone=boipt:10m rate=10r/s;

server {
    listen 80;
    server_name your-domain.example;

    client_max_body_size 1m;

    location ~ ^/api/(login|register|token)$ {
        limit_req zone=boipt burst=5 nodelay;
        proxy_pass http://127.0.0.1:8090;
        include /etc/nginx/proxy_params;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        limit_req zone=boipt burst=40 nodelay;
        proxy_pass http://127.0.0.1:8090;
        include /etc/nginx/proxy_params;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

`proxy_params` passes `Host` and `X-Forwarded-For`; the app needs both (same-origin
check and per-IP rate limits, with `TRUST_PROXY=1`). Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/your-domain.example /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS via Let's Encrypt:

```bash
sudo certbot --nginx -d your-domain.example
```

Open **https://your-domain.example** and log in with the admin account.

---

## 5. Registration

Registration is **closed** by default: only existing accounts can log in and the sign-up
tab is hidden. As the admin, go to *Sync → Admin* and click **Open registration** to let
people create accounts; click **Close registration** when they are done. The setting is
stored in `data/settings.json` and survives restarts and rebuilds. Sign-ups are limited
to 10 attempts per IP per hour, also while registration is closed.

---

## 6. Updating

On your PC: commit and push. On the server:

```bash
cd ~/BOIPT && git pull --ff-only && docker compose up -d --build
```

Accounts, sessions, settings and progress live in `data/` and stay in place.

---

## 7. Backup

The whole data directory (accounts, sessions, settings, progress per account):

```bash
umask 077
tar czf ~/boipt-backup-$(date +%F).tgz -C ~/BOIPT data
```

Keep that backup as safe as the server: it contains password hashes. Players can also
download their own progress on the site: *Sync → Download backup*.

---

## 8. Windows: sync your save automatically

`tools/sync-save.ps1` sends your save to your account without a browser. It runs in
Windows PowerShell 5.1 (built into Windows 10/11); its prompts are in English.

1. Get the script on your PC: clone the repository, or download `tools/sync-save.ps1`
   from it into a folder that will stay put (the shortcut points to that location).
2. Open PowerShell in the folder that contains `tools\` and run, with your own address
   (the Sync page on the site shows this exact command, with the right `-Server`):

   ```powershell
   powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1 -Server https://your-domain.example -InstallShortcut
   ```

3. The script asks whether you already have an account (`y` = yes, `n` = no), then your
   email address and password. Creating an account from the script only works while
   registration is open. Your password is not stored: the server issues a sync token for
   this PC, saved encrypted with Windows DPAPI in
   `%APPDATA%\boipt\account-<server>.xml`.
4. From now on start Isaac with the **Isaac + sync** desktop shortcut. It launches the
   game through Steam, waits until you close it, and then uploads the newest
   `rep+persistentgamedata<slot>.dat` (Steam userdata, or *Documents\My Games* without
   Steam Cloud).

Manual sync and options:

```powershell
powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1 -Server https://your-domain.example
```

| Option | Effect |
|---|---|
| `-Slot 2` | Save slot 1, 2 or 3 (default 1). |
| `-SavePath <file>` | Use this save file instead of searching. |
| `-AfterGame` | Start Isaac, wait for it to close, then sync (what the shortcut does). |
| `-ResetLogin` | Log in again, or switch account. |

`-Server` overrides `BOIPT_SERVER`; without `-Server`, the script uses `BOIPT_SERVER`. There is
no built-in default: if neither is set, the script stops with an error. Pass your server's
public URL (its `PUBLIC_URL` from `.env`) with `-Server`, or set `BOIPT_SERVER` on the PC; the
Sync page on the site shows the exact command. The desktop shortcut stores the `-Server` it was
created with. Use only `https://` (or
`http://localhost`). Lost a PC? Revoke its sync token on the site under *Sync → Account*.

---

## Upgrading from the PIN version

The single-user PIN login and the PIN takeover are gone. Remove `ACCESS_PIN`, `STEAM_ID`
and `SESSION_SECRET` from `.env` (the server warns while they are set). An old
`data/progress.json` is ignored. To keep that progress, copy the file off the server,
log in to your new account and use *Sync → Restore backup* with it, then delete
`data/progress.json` (and `data/legacy-claim.json`, if present). The old PIN version of
the sync script no longer works: run the new one once to log in.

---

## Troubleshooting

| What you see | Cause |
|---|---|
| "This door is locked" stays after logging in | Cookie refused: is the site served over HTTPS and does nginx pass `X-Forwarded-Proto`? |
| "Request from another site refused." | nginx does not pass the `Host` header (`include /etc/nginx/proxy_params`). |
| "Too many failed attempts." | 5 wrong passwords or 30 attempts per IP within 15 minutes; wait 15 minutes. |
| "New accounts are currently not being accepted." | Registration is closed; the admin opens it under *Sync → Admin*. |
| No *Admin* section on the Sync page | You are not logged in as `ADMIN_EMAIL`, or the admin account was never created (check the log, see step 3). |
| Sync command on the Sync page shows the wrong address | `PUBLIC_URL` is empty or invalid (the log warns); set it to `https://your-domain` and run `docker compose up -d`. |
| Steam sync says 0 | In Steam: *Edit Profile → Privacy → Game details: Public*. |

View the logs:

```bash
docker compose logs -f --tail 50
```
