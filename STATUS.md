# Session handoff – where we stopped

Last updated after commit `bf0a939` on branch `network-stabilization-and-visuals`
(everything described here is committed and pushed; `master` is NOT merged yet, no PR opened).

## Done so far (this branch)

1. **Netcode rewrite** – fixed 30 Hz tick, client prediction + reconciliation, snapshot
   interpolation, compact 20 Hz snapshots, server authority (damage, kills, items),
   input validation, reconnect / disconnect handling. See README "Netcode".
2. **Graphics** – ParticleSystem (muzzle flash, tracers, explosions, decals, blood, auras,
   damage numbers, ambient weather), shadows, glows, screen shake, vignette, crosshair,
   chunked map rendering (10x10-tile offscreen canvases, LRU), frame cap 240, smoothed camera.
3. **Maps / biomes** – SVG tilesets (desert, winter) + props (boat, plane wreck, ruin,
   barrels, sandbags, craters), generator `tools/gen_map.py`, maps Arena / Desert Outpost /
   Frozen Lake, previews via `tools/render_map.py`.
4. **Bots** – `server/bots/` (NavGrid + A* with ALT landmarks, Locomotion, Bot states
   Roam/Hunt/Engage/Flee/Collect, ballistics-based aiming, 4 difficulty presets, BotManager),
   `.env` keys `game_bots`, `game_bot_difficulty`, `game_bot_autostart`, `game_bot_seed`,
   `game_bot_debug`; smoke test `npm run test:bots`.
5. **Characters** – six SVG-generated arena characters (Viper, Ghost, Rook, Blitz, Nova,
   Talon) with idle/fire/walk/jump/corpse frames; bots wear them, humans pick one in Settings.
   `npm run gen:characters`.
6. **Gameplay** – player speed 16 -> 12.8, Space jump passes over walls/props (not water),
   game modes Deathmatch (respawn, frag limit) / Rounds, dead players spectate others
   (arrows / click to switch).
7. **Deployment** – Dockerfile, host list entry "This server" (same origin). Deployed to
   Cloud Run: project `strafeshooter-ostap`, service `strafeshooter`, region
   `europe-central2`, URL https://strafeshooter-309943430508.europe-central2.run.app

## Open items / where to continue

- **Cloud Run is still private (403).** Run once (Claude Code's safety filter refused to
  grant public access itself):
  `gcloud run services add-iam-policy-binding strafeshooter --region europe-central2 --project strafeshooter-ostap --member=allUsers --role=roles/run.invoker`
  Redeploy after code changes: `gcloud run deploy strafeshooter --source . --region europe-central2 --project strafeshooter-ostap`
- **Unanswered questions from the owner**: does the movement still "jump" (judder) after the
  frame-cap / camera fixes (monitor refresh rate?); and what "loot drop" meant – crates
  spawn/pickup/respawn were verified working server- and client-side, so it is either
  something visible in the browser or the feature "killed players drop their weapon ammo"
  (not implemented yet).
- Bots: CurveGun <-> LightGun swap flicker on nightmare, long hard-bot duels, per-tick budget
  tight on Frozen Lake in the first seconds (see ROADMAP.md section 1 remaining items).
- Characters: Settings preview has no weapon; bots 7+ reuse looks.
- Roadmap next: single-player campaign ("Strafe Tour", ROADMAP.md section 2), more biomes,
  team mode, kill feed / scoreboard, dependency upgrade (p5 0.5.4, socket.io 2.2 – Dependabot
  alerts on GitHub).
- Local demo: `npm run server` then http://localhost:3000 -> Server list -> "This server".
  `server/.env` ships game_bots=3, game_mode=0 (deathmatch), game_map=0.

## Verification tools (how things were tested)

- `npm run test:bots` – nav bake on all maps + live 3-bot match (must PASS, 0 errors).
- Real-browser probe pattern (Playwright is a devDependency): join through the server list,
  move for a few seconds, read `gameEngine.reconcile` errors, input ack lag, frame times,
  `gameEngine.players`; the scripts lived in the session scratchpad and are not in the repo –
  rewrite from this description if needed (`tools/botmatch.js` shows the socket flow).
- Engine test for the jump: load the shared files with `vm.runInThisContext` like
  `server/server.js` does, add a Player next to a wall, feed inputs through `inputQueue`,
  `game.update()` per tick (remember `player.kill()` to remove the body between runs).
