# Multiverse Quest

A text role-playing game played against an AI Game Master. You can be anyone:
a Keyblade wielder, a Shinigami from Bleach, a Persona user, a Jedi, a
Pokémon trainer, a crossover of all of them, or a plain D&D fighter. The Game
Master builds a rule system for your character, runs the adventure, rolls real
dice, and makes up new rules as the story needs them. Pictures of your
character, scenes, monsters and loot are generated as you play.

## Features

- **Create anyone**: describe a character in your own words, start from one of
  18 archetypes (pop culture and classic fantasy), or tap **Surprise me** for
  an AI-generated idea. Set the tone, how rules-heavy it is, and the art style.
- **AI character sheets**: stats, resources (HP, MP, Reiatsu, Chakra…),
  abilities, a signature mechanic (Persona, Bankai, Drive Form…), inventory,
  backstory, a world, and a rule set in the style of the source.
- **Play by text**: streamed narration, tappable suggested actions, and
  quick prompts for a plot twist, new loot, a new character, a crossover, or a
  picture of the current moment.
- **Real dice**: the Game Master asks for rolls and the app rolls them with
  the browser's crypto random generator, then shows the result.
- **Rules made up during play**: new mechanics go into the **Codex** tab,
  marked in gold.
- **Live character sheet**: HP bars, conditions, XP, level-ups, items and new
  abilities update as the story goes.
- **Journal and Gallery**: location, quests and NPCs, plus every picture from
  the adventure. Tap a picture to enlarge it or redraw it.
- **Saves**: every adventure is saved in the browser (IndexedDB). You can
  undo the last turn, and export or import a save as JSON.

## How it works

- `js/gm.js`: calls Claude from the browser with the official Anthropic SDK
  (loaded from jsDelivr the first time it's needed).
  - Character creation uses structured outputs (a JSON schema) so the sheet
    always has the right shape.
  - The Game Master is a streaming tool-use loop. Its tools are `roll_dice`,
    `update_character`, `create_rule`, `show_image`, `update_journal` and
    `suggest_actions`. Only `roll_dice` needs an answer before the story can
    continue. The results of the other tools are sent along with the player's
    next message, which saves a request each turn.
  - Each player message includes a `<state>` snapshot of the character, so
    the model doesn't have to track the numbers itself. Prompt caching keeps
    long campaigns cheap.
  - The default model is Claude Opus 5, with server-side fallbacks turned on.
    You can switch to Sonnet 5 or Haiku 4.5 in Settings.
- `js/images.js`: builds [Pollinations](https://pollinations.ai) image URLs.
  They're free and need no key. The same prompt always gives the same picture,
  so images come back after a reload.
- `js/app.js`: the UI (home, creator, play screen, settings). There's no
  build step and no framework.

## Setup

1. Get an Anthropic API key at <https://console.anthropic.com/settings/keys>.
2. Open the app and paste the key into **Settings**. It's stored only in your
   browser (localStorage) and sent only to `api.anthropic.com`. The API bills
   your account for usage.

Because the key lives in the browser, this setup is meant for playing on your
own devices. To share the app with other people without giving them your key,
put a small server in front of the API that holds the key.

## Running it

Serve the repository root over HTTP and open `/quest/`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/quest/
```

On GitHub Pages it's at `https://<user>.github.io/<repo>/quest/`. It installs
as a home-screen app like the DigiDex does.
