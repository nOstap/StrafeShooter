# StrafeShooter – notes for Claude Code

Read STATUS.md first (handoff: what is done, what is open), then README.md and ROADMAP.md.

## Layout
- `server/server.js` loads everything under `public/shared` with `vm.runInThisContext`, so the
  shared classes, `CFG`, `MAPS`, `Vec2`, `_guid` ... are bare globals on the server
  (`global.CFG` is undefined – reference `CFG` directly). `IS_SERVER` selects behaviour.
- `public/shared/classes/*` runs on both sides (simulation); `public/classes/*` is client only
  (rendering, GUI, particles); `server/bots/*` are plain CommonJS modules.
- Maps are Tiled JSON in `public/assets`; `tools/gen_map.py` generates them, `tools/gen_tileset.py`
  and `tools/gen_characters.py` generate SVG art, `tools/render_svg.js` rasterizes with Chromium.

## Conventions
- ES5 prototypes, `var`, 4-space indent, comments only where the logic is non-obvious.
- Anything that changes the simulation must be deterministic and identical on server and
  client (fixed tick, no `Math.random` in shared gameplay code paths that affect state;
  `_superRandom` is seeded).
- Never create or destroy Box2D bodies inside a contact callback (world is locked) – defer.
- box2dweb quirks: `SetFilterData` does not re-flag existing contacts; the fixture list head
  is the last created fixture (the gun arm, not the torso).

## Commands (Windows: refresh PATH in PowerShell first:
`$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")`)
- `npm run server` – game server + client on :3000 (settings in `server/.env`)
- `npm run test:bots` – must pass before committing bot or engine changes
- `npm run gen:maps`, `npm run gen:tilesets`, `npm run gen:characters`
- `node --check <file>` on every edited JS file; Playwright + Chromium are installed for
  real-browser checks.
- Do not use or kill port 3000 while the owner is playing; use 3010+ for test servers and
  stop every process you start (`pgrep`/`pkill -f` self-match: kill by PID).
