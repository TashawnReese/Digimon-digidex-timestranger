# DigiDex: Time Stranger

A phone-friendly web app for tracking Digimon and planning digivolution lines in
**Digimon Story: Time Stranger**. It's a Progressive Web App (PWA): open it in
your phone's browser, add it to your home screen, and it works like an app,
including offline.

Game data comes from [Game8's Time Stranger guide](https://game8.co/games/Digimon-Story-Time-Stranger/archives/554944):
every Digimon, its digivolutions and requirements, level 99 stats, resistances, skills and traits.

## Features

- **Dex**: search and filter Digimon by stage and attribute.
- **Digimon page**: Field Guide number, stage, attribute, type and personality;
  what it digivolves to and from, with requirements (Agent Rank, stats, other
  conditions); its full digivolution line grouped by stage; level 99 stats,
  attribute and element resistances, special and attachment skills, and traits.
- **Planner**: pick a starting Digimon and a goal to get the shortest route,
  including de-digivolution steps if you allow them, with the requirements for
  each step.
- **My Team**: track your own Digimon with nickname, level, goal and notes.
  Mark steps as done as you digivolve, and see your progress and history.
- **Data**: add or edit Digimon and digivolutions, see what still needs
  checking, and export or import JSON to back up or move to another phone.

Your team and any data edits are saved on your device (localStorage).

## Data

Bundled data lives in [`data/digimon.json`](data/digimon.json):

```jsonc
{
  "digimon": [
    { "id": "impmon", "name": "Impmon", "stage": "Rookie", "attribute": "Virus", "type": "Imp", "verified": false }
  ],
  "evolutions": [
    {
      "from": "impmon", "to": "devimon",
      "requirements": { "level": 20, "agentRank": 2, "stats": { "ATK": 80 }, "other": "…" },
      "verified": false
    }
  ]
}
```

Digivolutions are one-way edges (`from` → `to`). De-digivolution is the same
edge followed backwards. Requirements are the ones for digivolving into the `to`
Digimon.

### Refreshing the data

`tools/scrape_game8.py` rebuilds `data/digimon.json` from Game8. It fetches
one page every 1.5 seconds and caches pages in `tools/.cache/`. Delete that
folder to fetch fresh copies.

```sh
pip install beautifulsoup4 lxml
python3 tools/scrape_game8.py
```

Bump `version` in the JSON whenever it changes. The app then merges the new
data on next launch and keeps anything the user edited by hand.

## Running it

It's plain HTML, CSS and JavaScript with no build step. Serve the folder over
HTTP:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

To use it on your phone, host it somewhere with HTTPS. The easiest option is
GitHub Pages: in the repository's **Settings → Pages**, deploy from a branch
and pick the branch and `/ (root)`. Then open the URL on your phone and choose
**Add to Home Screen** (Safari's Share menu on iPhone, the ⋮ menu in Chrome
on Android).
