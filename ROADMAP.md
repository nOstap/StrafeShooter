# Roadmap

Where the project is heading after the netcode / graphics / maps pass. Items are ordered so that
each step is playable on its own and builds on the previous one.

## 1. Bots (server-side AI players)

Done – see [Bots in the README](README.md#bots). Bots are plain `Player` entities driven by
`server/bots/BotManager.js` through `game.queueInput`, the same input queue real clients use, and
fill empty slots (`game_bots=N` in `.env`).

* ~~**Navigation**~~ – done: 0.5 m clearance grid from `Walls`/`SeaWalls`, Dijkstra flow fields
  to every spawn point, budgeted A* with string-pulling, feelers, separation and stuck recovery.
  Cached per map.
* ~~**Behaviour / states**~~ – done: utility states `ROAM`, `COLLECT`, `HUNT` (engage / chase),
  `FLEE`, with an always-on combat layer.
* ~~**Aim model**~~ – done: per-weapon flight tables from the real bullet classes, target lead,
  Ornstein-Uhlenbeck aim error, weapon choice by expected damage, rocket self-damage guard.
* ~~**Difficulty presets**~~ – done: `easy / normal / hard / nightmare`.
* Still open:
  * Debug overlay (`CFG.DEBUG`) on the client: draw paths, current state, target (the data is
    already served by `GET /debug/bots`).
  * Headless bot-vs-bot matches on a fake clock (see §5), so whole matches become reproducible
    and fast enough for CI.
  * Item timing (remember when a crate was taken and be there when it respawns).
  * Team tactics for `CFG.GAME_MODES.TEAMS`.

## 2. Single-player campaign ("Strafe Tour", Quake 3 style)

* `campaign.json`: a ladder of tiers, each tier = map + bot roster (names, skins, difficulty) +
  win condition (frag limit / rounds) + a short intro text. Tier 1 arena with one easy bot, final
  tier a huge map against the "champion".
* **Local server mode** – reuse `game-server.js` `/local-server` to fork a server with
  `game_bots` and `campaign_tier`; the client connects to localhost. No new netcode needed.
* Progress saved in `localStorage` (unlocked tiers, best time, frags). Tier select screen with
  the map preview PNGs from `tools/render_map.py`.
* Story beats as short loading-screen cards (one paragraph per tier, a character portrait made
  from the existing head/body sprites).
* Medals: *Perfect* (no deaths), *Excellent* (2 frags within 2 s), *Impressive* (two Bow hits in
  a row) – cheap to detect server-side, big fun payoff.

## 3. More biomes and maps (SVG pipeline)

The generator already renders any biome from a palette (`tools/gen_tileset.py` `BIOMES`), so
each new biome is a palette + a few shape tweaks + one preset:

* **Volcanic** – black rock, lava instead of water (lava damages, `WATER` category with a
  damage property), obsidian walls, ember ambient particles.
* **Jungle / swamp** – dense canopy (more top-layer trees), mud, rope bridges, fireflies.
* **Urban ruins** – asphalt, road markings, car wrecks (new 2x1 prop), broken buildings with
  interiors you can enter, dust ambient.
* **Space station** – metal floor, glass walls (block movement, not bullets: a new collision
  category), airlocks, star field outside the map.
* Map sizes: tiny duel maps (20x16, 2 spawns) through huge 160x120 maps for 10+ players;
  presets `duel_*`, `*_large` in `PRESETS`.
* Hand-tuning: `tools/gen_map.py` could export the map, you edit it in Tiled, and a
  `--from` flag re-applies edge/collision generation on the edited layout.

## 4. Gameplay & polish

* Team mode (`CFG.GAME_MODES.TEAMS`) – spawns already carry `team_red` / `team_blue`.
* Kill feed, scoreboard with ping column, end-of-match podium.
* Weapon balance pass with the new deterministic tick (rocket self-damage, Spas spread).
* Sound: positional panning (the `SoundManager.worldPlay` volume model already exists).
* Mobile/touch controls (virtual sticks) – the input layer is already a plain `INPUT` map.

## 5. Infrastructure

* Headless bot-vs-bot matches as an automated smoke test for maps (no unreachable spawns, no
  stuck bots) – run in CI with `tools/gen_map.py` output.
* Replace the `/local-server` child-process launcher with an in-process game manager so one
  Node process can host several rooms.
* Dockerfile for the public server; keep `host_list.json` as the master server list.
