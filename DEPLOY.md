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

Iedereen maakt op de site zelf een account (e-mail + wachtwoord); er hoeft dus niets
verplicht in `.env`. Alleen als er nog voortgang van vóór de accounts in
`data/progress.json` staat, laat je daar de oude PIN staan:

```
ACCESS_PIN=<je oude PIN>
```

Daarmee kan de eigenaar die voortgang één keer naar zijn account halen (zie
*8. Van PIN naar accounts*). `SESSION_SECRET` wordt niet meer gebruikt.

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

    location ~ ^/api/(login|register|token|legacy/claim)$ {
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

Open daarna **https://isaac.wolfs.dev**, maak een account en lees je save in via *Sync*.

---

## 5. Bijwerken

Op je pc: committen en pushen. Op de server:

```bash
cd ~/BOIPT && git pull && docker compose up -d --build
```

Accounts, sessies en voortgang staan in `data/` en blijven gewoon staan.

---

## 6. Back-up

De hele datamap (accounts, sessies, voortgang per account):

```bash
tar czf ~/boipt-backup-$(date +%F).tgz -C ~/BOIPT data
```

Bewaar die back-up net zo zorgvuldig als de server: er staan wachtwoord-hashes in.

In de site zelf kan het ook: *Sync → Download back-up*.

---

## 7. Save automatisch insturen vanaf je pc

Eenmalig een snelkoppeling maken. De eerste keer log je in (of maak je een account);
het script bewaart geen wachtwoord, alleen een eigen sync-token voor deze pc,
versleuteld met Windows DPAPI in `%APPDATA%\boipt\account-<server>.xml`:

```powershell
powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1 -InstallShortcut
```

Start Isaac voortaan met **Isaac + sync** op je bureaublad: zodra je het spel afsluit,
staat je nieuwe stand online in jouw account. Handmatig kan ook:

```powershell
powershell -ExecutionPolicy Bypass -File tools\sync-save.ps1
```

Ander account of opnieuw inloggen: `-ResetLogin`. Een pc kwijt? Trek zijn sync-token in
op de site onder *Sync → Account*.

---

## 8. Van PIN naar accounts

Wie de site al met de PIN gebruikte, neemt zijn voortgang zo over:

1. Laat `ACCESS_PIN` in `.env` staan en werk bij (zie 5).
2. Maak op de site een **nieuw** account.
3. *Sync → Account → Oude voortgang overnemen*: vul de oude PIN in.

Dat kan precies één keer, en alleen in een account zonder eigen voortgang.
`data/legacy-claim.json` legt vast welk account het was; `data/progress.json` blijft als
back-up staan maar wordt nergens meer getoond. Doe dit meteen na de update en haal daarna `ACCESS_PIN` uit `.env` (een korte PIN is anders op den duur te raden).
Het oude sync-script (met PIN) werkt niet meer: draai het nieuwe één keer om in te loggen.

---

## Problemen

| Wat je ziet | Oorzaak |
|---|---|
| "Deze deur is op slot" blijft na het inloggen | Cookie geweigerd: draait de site via HTTPS en geeft nginx `X-Forwarded-Proto` door? |
| "Verzoek van een andere site geweigerd" | nginx geeft de `Host`-header niet door (`include /etc/nginx/proxy_params`). |
| "Te veel foute pogingen" | 5 foute wachtwoorden of 30 pogingen per IP binnen 15 minuten; wacht een kwartier. |
| Overnemen hing (crash halverwege) | `data/legacy-claim.json` staat er, maar het account heeft niets. Verwijder dat bestand en probeer opnieuw. |
| Oude voortgang overnemen staat er niet | `ACCESS_PIN` is leeg, er is geen `data/progress.json`, of hij is al overgenomen. |
| Steam-sync zegt 0 | In Steam: *Profiel bewerken → Privacy → Game details: Openbaar*. |

Logs bekijken:

```bash
docker compose logs -f --tail 50
```
