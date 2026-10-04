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
- **Privé**: alles achter een PIN, met rate limits.

## Lokaal draaien

```bash
npm install
```

```bash
cp .env.example .env
```

Zet in `.env` minstens `ACCESS_PIN` en voor lokaal `TRUST_PROXY=0`, en start:

```bash
npm run dev
```

De site staat dan op http://localhost:8090.

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
| `server/` | Express: statische site, PIN-login, rate limits, voortgang (`data/progress.json`), Steam-proxy, save-upload |
| `web/js/save-parser.js` | Leest `rep+persistentgamedata*.dat` (achievements, marks, tellers); draait in browser en Node |
| `web/js/logic.js` | Afhankelijkheden: wat is binnen, beschikbaar of op slot, en waarom |
| `web/js/advisor.js` | Run-planner en meta-route |
| `web/data/characters.js` | Personages en marks in save-volgorde |
| `web/data/route.js` | Meta-route en "liever uitstellen", met bronnen |
| `tools/sync-save.ps1` | Save insturen zonder browser, ook automatisch na het spelen |

Deployen: zie [DEPLOY.md](DEPLOY.md).

## Bronnen

- Unlock-eisen: [Binding of Isaac: Rebirth Wiki](https://bindingofisaacrebirth.wiki.gg/wiki/Achievements) (CC BY-SA 3.0), via de Cargo-export.
- Save-indeling: [REPENTOGON EventCounter](https://repentogon.com/enums/EventCounter.html), nagerekend met de offsets uit [isaac-save-edit-script](https://github.com/jamesthejellyfish/isaac-save-edit-script) (MIT).
- Route-advies: [Most & Least Important Unlocks](https://steamcommunity.com/sharedfiles/filedetails/?id=2994836310), [Dead God Roadmap](https://steamcommunity.com/sharedfiles/filedetails/?id=2980920774), [Dead God / Infinity route](https://steamcommunity.com/sharedfiles/filedetails/?id=3712501774).
- Lettertypen (OFL): Rock Salt, Gochi Hand, Patrick Hand, Pixelify Sans.

Fanproject, niet verbonden aan Nicalis of Edmund McMillen.
