# Draaiboek voor de server

De service heet `boipt`, de container ook. Hij draait op poort **8090**, alleen op
localhost; nginx zet hem online op **isaac.wolfs.dev** met HTTPS.

Bijwerken gaat net als bij WolfsPiano: `git pull` en opnieuw bouwen.

---

## 1. Eenmalig: DNS

Maak bij je domeinbeheer een **A-record** aan:

| Naam | Type | Waarde |
|---|---|---|
| `isaac` | A | het IP-adres van je VPS |

Controleer na een paar minuten met `ping isaac.wolfs.dev` of hij naar je server wijst.

---

## 2. Eenmalig op de server: repo en instellingen

Docker heb je al van WolfsPiano. Repo ophalen:

```bash
git clone https://github.com/raylano/BOIPT.git ~/BOIPT && cd ~/BOIPT
```

> **Privé-repo?** Gebruik dezelfde deploy key als bij WolfsPiano (GitHub → repo →
> *Settings → Deploy keys*) en kloon met `git@github.com:raylano/BOIPT.git`.

Instellingen:

```bash
cp .env.example .env
```

```bash
nano .env
```

Vul minimaal in:

```
ACCESS_PIN=<jouw PIN>
```

`SESSION_SECRET` mag leeg blijven; dan maakt de server er zelf een en bewaart die in
`data/.session-secret`. Wil je hem zelf zetten: `openssl rand -hex 32`.

---

## 3. Eerste start

```bash
docker compose up -d --build
```

Controleren:

```bash
docker compose ps
```

```bash
curl -s http://127.0.0.1:8090/api/health
```

Daar hoort `{"ok":true}` uit te komen.

---

## 4. nginx en HTTPS

Maak `/etc/nginx/sites-available/isaac.wolfs.dev`:

```nginx
# Tweede laag rate limiting, naast die in de app zelf.
limit_req_zone $binary_remote_addr zone=boipt:10m rate=10r/s;

server {
    listen 80;
    server_name isaac.wolfs.dev;

    client_max_body_size 1m;

    location /api/login {
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

Aanzetten en testen:

```bash
sudo ln -s /etc/nginx/sites-available/isaac.wolfs.dev /etc/nginx/sites-enabled/
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS via Let's Encrypt (zelfde als Wolfs.dev):

```bash
sudo certbot --nginx -d isaac.wolfs.dev
```

Open daarna **https://isaac.wolfs.dev**, toets je PIN in en lees je save in via *Sync*.

---

## 5. Bijwerken

Op je pc: committen en pushen. Op de server:

```bash
cd ~/BOIPT && git pull && docker compose up -d --build
```

Je voortgang staat in `data/progress.json` en blijft gewoon staan.

---

## 6. Back-up

Eén bestand:

```bash
cp ~/BOIPT/data/progress.json ~/boipt-backup-$(date +%F).json
```

In de site zelf kan het ook: *Sync → Download back-up*.

---

## 7. Save automatisch insturen vanaf je pc

Eenmalig een snelkoppeling maken (vraagt één keer je PIN en bewaart die versleuteld):

```powershell
powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1 -InstallShortcut
```

Start Isaac voortaan met **Isaac + sync** op je bureaublad: zodra je het spel afsluit,
staat je nieuwe stand online. Handmatig kan ook:

```powershell
powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1
```

---

## Problemen

| Wat je ziet | Oorzaak |
|---|---|
| "Deze deur is op slot" blijft na de juiste PIN | Cookie geweigerd: draait de site via HTTPS en geeft nginx `X-Forwarded-Proto` door? |
| "Te veel foute pogingen" | 5 foute PINs binnen 15 minuten; wacht een kwartier. |
| Steam-sync zegt 0 | In Steam: *Profiel bewerken → Privacy → Game details: Openbaar*. |
| Container start niet: `ACCESS_PIN` | De PIN ontbreekt in `.env`. |

Logs bekijken:

```bash
docker compose logs -f --tail 50
```
