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

See [ROADMAP.md](ROADMAP.md) for what comes next (bots, single-player campaign, more biomes).
