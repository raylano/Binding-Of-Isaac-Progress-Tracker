# Kelderdagboek

Voortgangstracker voor **The Binding of Isaac: Repentance+**, in de stijl van het spel:
een donkere kelder, papieren briefjes en een pixel-HUD.

- **Al je unlocks**: 641 achievements, 34 personages, 408 completion marks (normal én hard).
- **Echte vergrendelingen**: elke unlock weet wat ervoor nodig is. Downpour opent pas na
  *A Secret Exit* (Hush 3x), The Beast pas na *A Strange Door* (Mother), enzovoort.
  Bij alles wat op slot zit staat de keten van wat je eerst moet doen.
- **Afvinken**: tik een mark aan (leeg → normal → hard). De bijbehorende unlocks gaan vanzelf mee.
- **Route-advies**: per personage de run die nu het meeste oplevert, de "Beste volgende
  runs" over alle personages heen, en je plek in de meta-route uit drie veelgebruikte
  Steam-guides. Unlocks die de guides willen uitstellen (Missing No., TMTRAINER…) krijgen
  een waarschuwing en worden in plannen overgeslagen.
- **Sync**: je save-bestand inlezen (exact, inclusief Hard-marks en tellers zoals de
  Greed-machine), Steam-achievements aanvullen, of automatisch na het spelen via
  `tools/sync-save.ps1`.
- **Eigen accounts**: iedereen registreert zich met e-mail en wachtwoord; voortgang en
  save-uploads zijn strikt per account. Rate limits, intrekbare sessies.

## Lokaal draaien

```bash
npm install
```

```bash
cp .env.example .env
```

Zet in `.env` voor lokaal `TRUST_PROXY=0`, en start:

```bash
npm run dev
```

De site staat dan op http://localhost:8090. Maak daar een account.

## Tests

```bash
npm test
```

Met je echte save erbij (komt nooit in de repo):

```bash
ISAAC_SAVE="C:/Program Files (x86)/Steam/userdata/<id>/250900/remote/rep+persistentgamedata1.dat" npm test
```

## Data bijwerken

`web/data/achievements.json` komt uit de wiki en Steam en staat in de repo. Opnieuw
ophalen (alleen nodig als het spel nieuwe achievements krijgt):

```bash
npm run build-data
```

## Opbouw

| Pad | Wat |
|---|---|
| `server/` | Express: statische site, accounts en sessies, rate limits, voortgang per account, Steam-proxy, save-upload |
| `server/accounts.js` | Accounts (`data/users.json`) en sessies (`data/sessions.json`) |
| `server/passwords.js` | E-mail normaliseren, wachtwoordregels, scrypt-hashes |
| `server/store.js` | Voortgang in `data/users/<id>/progress.json`, eenmalige overname van de oude PIN-voortgang |
| `web/js/save-parser.js` | Leest `rep+persistentgamedata*.dat` (achievements, marks, tellers); draait in browser en Node |
| `web/js/logic.js` | Afhankelijkheden: wat is binnen, beschikbaar of op slot, en waarom |
| `web/js/advisor.js` | Run-planner en meta-route |
| `web/data/characters.js` | Personages en marks in save-volgorde |
| `web/data/route.js` | Meta-route en "liever uitstellen", met bronnen |
| `tools/sync-save.ps1` | Save insturen naar je account zonder browser, ook automatisch na het spelen |

Deployen: zie [DEPLOY.md](DEPLOY.md).

## Accounts en beveiliging

| Onderwerp | Keuze |
|---|---|
| Registratie | Open voor iedereen. E-mail wordt getrimd en in kleine letters gezet (punten en `+label` blijven). Geen e-mailverificatie of wachtwoordherstel per mail: de server verstuurt geen mail. |
| Wachtwoord | 12 tot 128 tekens, niet één herhaald teken, niet gelijk aan het e-mailadres. Opgeslagen als scrypt (N=32768, r=8, p=1, 16 bytes salt, 64 bytes hash); de parameters staan in de hash zodat ze later omhoog kunnen. |
| Dubbel account | `409`. Dat verraadt dat een adres bestaat; bewuste afweging voor een duidelijke melding, beperkt door 10 registraties per uur per IP. Inloggen geeft voor onbekend adres en fout wachtwoord wél exact hetzelfde antwoord, en rekent in beide gevallen een hash uit. |
| Sessies | 32 willekeurige bytes in een `HttpOnly; SameSite=Strict; Path=/`-cookie (`Secure` achter HTTPS), 30 dagen geldig. Op schijf alleen de SHA-256. Bij elke login een nieuw token. Uitloggen en intrekken werken direct. Max. 50 sessies per account. |
| Sync-script | Krijgt via `POST /api/token` een apart token (een jaar geldig) dat alleen als `Authorization: Bearer` werkt; een browsercookie werkt niet als bearer en andersom. Het wachtwoord wordt nooit bewaard. |
| CSRF | `SameSite=Strict`, plus: wijzigende verzoeken met een `Origin` van een andere host of `Sec-Fetch-Site: cross-site` krijgen `403`. |
| Rate limits | Inloggen/token: 5 fouten en 30 pogingen in totaal (scrypt is duur) per IP per 15 min. Bewust geen harde grens per account: daarmee kan een vreemde de eigenaar buitensluiten; tegen raden over veel IPs heen helpt de wachtwoordeis van 12+ tekens. Oude PIN: 5 fouten per IP per 15 min en 20 in totaal per uur. Registreren: 10 per IP per uur. Onbekende bearer-tokens: 20 per IP per 15 min. Tellers staan in het geheugen en beginnen na een herstart opnieuw. |
| Oude PIN | Een korte PIN is met veel accounts en IPs over dagen te raden, en de totale grens kan het overnemen een uur blokkeren. Neem de oude voortgang dus meteen na de update over en haal daarna `ACCESS_PIN` uit `.env`. |
| Isolatie | Voortgang staat in `data/users/<id>/progress.json`; het ID is 32 hex-tekens van de server zelf en wordt gecontroleerd voordat er een pad van wordt gemaakt. Steam-sync gebruikt alleen de SteamID die bij het account is opgeslagen. |
| Oude PIN-voortgang | Wordt aan niemand getoond. Overnemen kan één keer, met de juiste `ACCESS_PIN`, in een account zonder eigen voortgang. `data/legacy-claim.json` wordt exclusief aangemaakt, dus van gelijktijdige pogingen wint er één. |
| Gelijktijdigheid | Lezen-aanpassen-schrijven per account loopt via een slot; bestanden worden atomisch geschreven (`0600`, map `0700`). Eén serverproces per datamap: accounts en sessies staan in het geheugen. |
| Niet gedaan | Account verwijderen, wachtwoord wijzigen/vergeten, 2FA, e-mailverificatie. Wachtwoord vergeten = beheerder past `data/users.json` aan. Ingelogde accounts zien wél óf er nog oude voortgang over te nemen is (niet wat erin staat). |

## Bronnen

- Unlock-eisen: [Binding of Isaac: Rebirth Wiki](https://bindingofisaacrebirth.wiki.gg/wiki/Achievements) (CC BY-SA 3.0), via de Cargo-export.
- Save-indeling: [REPENTOGON EventCounter](https://repentogon.com/enums/EventCounter.html), nagerekend met de offsets uit [isaac-save-edit-script](https://github.com/jamesthejellyfish/isaac-save-edit-script) (MIT).
- Route-advies: [Most & Least Important Unlocks](https://steamcommunity.com/sharedfiles/filedetails/?id=2994836310), [Dead God Roadmap](https://steamcommunity.com/sharedfiles/filedetails/?id=2980920774), [Dead God / Infinity route](https://steamcommunity.com/sharedfiles/filedetails/?id=3712501774).
- Lettertypen (OFL): Rock Salt, Gochi Hand, Patrick Hand, Pixelify Sans.

Fanproject, niet verbonden aan Nicalis of Edmund McMillen.
