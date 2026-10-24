# StrafeShooter

Top-down HTML5 multiplayer arena shooter built on p5.js, Box2D (box2dweb), socket.io and Node.

All rights for images and code belong to me. If you would like to work with me on this project
please mail me or something.

## Running it

```sh
npm install
npm run server          # game server on :3000 (also serves the client), map from server/.env
```

Open `http://localhost:3000`, pick the "Lokalny" server in the list, join and press `3` when ready.

Server settings live in `server/.env` (`game_map` is an index into `MAPS` in
`public/shared/config.js`: `0` island, `1` arena, `2` desert outpost, `3` frozen lake).

Game modes (`game_mode`): `0` **Deathmatch** – you respawn 5 s after dying, first to
`game_frag_limit` frags (default 20) or the time limit wins; `1` **Rounds** – dead players spectate
until the round ends, last one standing wins the round, `game_rounds` rounds per match.

Controls: WASD move, mouse aim, left button fire, Space jump (a jump carries you over walls,
crates and wrecks – not water), Q cycles weapons (R rocket, E curve gun, F light gun, Shift bow,
C shotgun, Ctrl machine gun), 3 ready, 4 scoreboard. While dead or spectating, the camera
follows another player; ← / → or a click switch who you watch.

`npm start` runs the client as an NW.js desktop app; `node game-server.js` is the public lobby
server that can fork local game servers via `/local-server`.

## Netcode

The simulation runs the same fixed 30 Hz tick on the server and on every client
(`CFG.TICK_RATE`), so movement no longer depends on frame rate:

* **Client prediction + reconciliation** – the local player applies its own input immediately,
  every input carries a sequence number, the server acknowledges the last processed one in each
  snapshot and the client replays/corrects only the difference. Small errors are blended away
  visually, big ones (> `CFG.NET.SNAP_DISTANCE`) snap.
* **Snapshot interpolation** – remote players and items are rendered `CFG.NET.INTERP_DELAY` ms in
  the past between two server snapshots, so they move smoothly at any ping.
* **Server authority** – damage, kills, item pick-ups and respawns are decided only by the
  server; clients receive compact 20 Hz snapshots (`GameEngine._snapshot`) instead of the full
  game state. Inputs are validated (`Player.sanitizeInput`) and queued per player.
* **Reconnect / disconnect handling** – the client freezes when the socket drops and rebuilds
  the world cleanly on reconnect.

## Graphics

* `public/classes/ParticleSystem.js` – pooled, texture-based particles: muzzle flashes,
  tracers, impact sparks, rocket smoke trails, explosions with shockwave and debris, blood and
  scorch decals, pick-up bursts, buff auras, floating damage numbers and per-biome ambient
  weather (petals / snow / dust).
* `public/classes/RenderEngine.js` – multi-tileset maps, visible-range tile culling, drop
  shadows, additive glows, screen shake, damage vignette, custom crosshair, endless sea/sand
  outside the map.

## Maps and biomes

| index | map              | size    | biome   | tileset                        |
|-------|------------------|---------|---------|--------------------------------|
| 0     | Island (classic) | 85x75   | classic | `images/map_sprites.png`       |
| 1     | Arena            | 34x28   | classic | `images/map_sprites.png`       |
| 2     | Desert Outpost   | 64x52   | desert  | `images/map_sprites_desert.png`|
| 3     | Frozen Lake      | 120x100 | winter  | `images/map_sprites_winter.png`|

Maps are Tiled JSON (`public/assets/*.json`). The three new ones are generated:

```sh
npm run gen:tilesets    # SVG biome sheets -> public/assets/svg/, rasterized to PNG with Chromium
npm run gen:maps        # procedural maps -> public/assets/{arena,desert_outpost,frozen_lake}.json
python3 tools/render_map.py public/assets/frozen_lake.json preview.png 0.1 --overlay
```

Every biome sheet shares the classic sheet's 10x12 tile layout, so any map can be re-skinned by
swapping its tileset image. Multi-tile props (boat 2x4, crashed plane 4x3, destroyed building
2x3, barrels, crates, sandbags, craters) are drawn into fixed slots and placed by
`tools/gen_map.py` (`PROPS`) with matching collision boxes. Add a preset to `PRESETS` to get a
new map; change its `seed` to roll a new layout.

## Characters

Six arena characters, each with its own helmet, armour, back gear and animations (idle
breathing, firing recoil, 4-frame walk, stand, jump, corpse): **Viper** (venom-green flanker
with a fin-crested helmet and crossed blades), **Ghost** (white hooded recon with a cloak and
cyan twin eyes), **Rook** (heavy gunner: block helmet with an orange T-visor, hazard
pauldrons, ammo drum), **Blitz** (blue power armour, gold dome visor, jetpack), **Nova**
(purple cyborg with a cyclops lens and a chrome arm) and **Talon** (crimson horned berserker
with spiked pauldrons). Bots wear them in roster order (bot N gets character (N - 1) % 6);
players pick one under Settings > Character ("Classic" keeps the old head/body sprites).

The artwork is procedural: `tools/gen_characters.py` holds the palettes and shapes and writes
`public/assets/svg/characters.svg` plus the frame atlas `public/assets/characters.json`
(TexturePacker format, frames named `<key>_body_idle_0`, `<key>_legs_walk_2`, ...). The
character list itself (names, order) lives in `CFG.CHARACTERS` in `public/shared/config.js`
and must match the generator's order.

```sh
npm run gen:characters  # regenerate the SVG + JSON and rasterize public/assets/images/characters.png
```

## Bots

Bots are ordinary `Player` entities that live on the server (`server/bots/`). Every tick the
`BotManager` builds one input per bot and feeds it through `game.queueInput`, the same path a
client's `player_input` takes, so the simulation has no bot special cases and clients need no
changes: bots show up through the usual `player_joined_game`, `player_joined_match` and
`sync_game` events, named `[BOT] Viper`, `[BOT] Ghost`, ...

**Play solo:** `npm run server` (the shipped `server/.env` has `game_bots=3`), open
`http://localhost:3000`, join the match and press `3`. The bots join as soon as you do and ready
up on the next tick, so your ready starts the match.

| env key               | values                                             | default |
|-----------------------|----------------------------------------------------|---------|
| `game_bots`           | number of bots, clamped to `0 .. CFG.MAX_PLAYERS-1`; `0` = no bot code runs at all | `0` (`.env` ships `3`) |
| `game_bot_difficulty` | `easy`, `normal`, `hard`, `nightmare`, or a list (`easy hard`, `easy,hard`) cycled per bot; unknown names are dropped | `normal` |
| `game_bot_autostart`  | `1` = bots start (and restart) matches with no human in them | `0` |
| `game_bot_seed`       | unsigned int; seeds the bots' RNGs and also `srcore` (spawn points, spread) | unset: bot RNGs use `CFG.SEED`, spawns stay random |
| `game_bot_debug`      | `1` = `GET /debug/bots` JSON and a perf line every 300 ticks | `0` |

The lobby's `/local-server` forwards `game_bots` and `game_bot_difficulty` (use spaces, not
commas, in a difficulty list there: the lobby strips commas).

**Fill and ready policy.** Between matches the manager keeps
`min(game_bots, max_players - humans)` bots (every connected human, spectating or not,
reserves a slot; `game_max_players` is capped at `CFG.MAX_PLAYERS`). Bots join the match only
while a human is in it (or with `game_bot_autostart=1`), ready up whenever a human is in the
match and un-ready if every human leaves before the start. A running match left with only bots
is ended after 150 ticks (5 s) unless autostart is on. After a match ends, bots rejoin on the
tick a human joins, before readiness is checked; with only autostart keeping them in, they wait
90 ticks (3 s) before starting the next match.

**Presets** (`server/bots/BotConfig.js`, `PRESETS`):

| preset    | reaction | aim error | turn rate | awareness / FOV | hearing | strafe & dodge | other |
|-----------|----------|-----------|-----------|-----------------|---------|----------------|-------|
| easy      | 12 ticks | 9°        | 8°/tick   | 14 m / 180°     | off     | slow strafe, no dodge | switches weapon only when empty, ignores ammo |
| normal    | 8 ticks  | 5°        | 15°/tick  | 20 m / 240°     | 16 m    | 15% dodge      | ammo-aware |
| hard      | 5 ticks  | 2.5°      | 25°/tick  | 28 m / 300°     | 24 m    | 45% dodge, some dodge jumps | pre-aims while chasing |
| nightmare | 3 ticks  | 1.2°      | 45°/tick  | 40 m / 360°     | 40 m    | 80% dodge, 60% dodge jumps | thinks every 2 ticks |

**How they work.**

* *Navigation:* a 0.5 m clearance grid baked from `Walls` and `SeaWalls` (a cell is walkable
  0.4 m from any blocker), Dijkstra flow fields to every player/item spawn, A* with a per-tick
  expansion budget plus string-pulling for everything else (the flow fields double as ALT
  landmarks for its heuristic). Wall feelers, separation and a stuck ladder (re-path,
  sidestep, jump, give up) handle the rest. Baked once per map (about 0.1 s for Frozen Lake).
* *Behaviour:* utility states `ROAM` (visit spawn points), `COLLECT` (items worth the detour),
  `HUNT` (`ENGAGE` a visible enemy while strafing, `CHASE` its last known position) and `FLEE`
  (low health: run for a LifeBox / MaximumDefense). A combat layer runs every tick in every
  state: target choice, weapon choice by expected damage (`dps x hit chance` from per-weapon
  flight tables built from the real bullet classes), leading the target, Gaussian aim error and
  a fire gate (reaction time, aim tolerance, line of sight, minimum hit chance, rocket safety).
* *Debug:* with `game_bot_debug=1`, `GET /debug/bots` returns each bot's state, target, weapon,
  ammo, goal, current path and a trace of recent decisions, plus perf stats
  (`avgUsPerBotTick`, `maxUsTick`, A* counters, errors).

**Smoke test:** `npm run test:bots` (`node tools/botmatch.js`). Part A bakes every map and
checks that all spawns are reachable and that A* agrees with the flow fields; Part B starts a
real server, joins as a human that never moves, readies, and passes once the bots have joined,
started the match, moved and fired, with no errors and an average cost under 300 µs per bot
per tick. Flags: `--static-only`, `--live-only`, `--map N` (default `1`), `--bots N` (default
`3`), `--difficulty NAME` (default `hard`), `--autostart` (only spectate; the bots must start
the match themselves), `--timeout S` (default `30`).

**Known limits.**

* Matches are not bit-reproducible even with `game_bot_seed`: weapon cooldowns, bullet
  lifetimes, spawn delays, buffs and round time all run on `Date.now()`. Bot decisions
  themselves only use the per-bot RNG and `game.tick`.
* Rockets damage their shooter. Bots never fire one at a target closer than 3.5 m (its real
  position, not the reaction-delayed one they aim at) or when the predicted impact (first wall
  or the target) is within 2 m, but a player or crate crossing the rocket's path can still blow
  it up close by. Once off rockets they only switch back from 5.5 m.
* After a quiet spell with no enemy contact (`hunchTicks`, 4-30 s depending on the preset) a
  bot homes in on the nearest enemy's real position, so hiding does not stall a round forever.
* In `ENGAGE` a bot holds its weapon's preferred range, but closes in to where its hit chance
  reaches the preset's minimum, so two strafing bots do not circle each other without firing.
* The first second or so after the bots spawn is slower (cold JIT); the smoke test reads the
  perf stats after 300 active ticks.

See [ROADMAP.md](ROADMAP.md) for what comes next (single-player campaign, more biomes).
