# Session handoff – where we stopped

Last updated on branch `network-stabilization-and-visuals` after the kill feed / scoreboard work
(merged into `master` and pushed on 2026-10-24; branch and master point at the same commit).

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
8. **Kill feed / scoreboard / match results** – `player_death` now carries the
   weapon class name (`dealDamage` 4th arg; self-kills have `killer: null`), `Player.ping` is
   reported by the client in `ping_check` (`{t, p}`) and broadcast in the snapshot as `pg`.
   Client: `KillFeedElement` (top right, weapon icon, fades after 6 s) + centre banner when you
   frag / get fragged, `ScoreboardElement` while Tab is held (place, name, K, D, ping; Tab no
   longer moves browser focus), `Gui.setMatchResults` fills `#match-results` on the spectate
   screen from `Interface.standings()` captured in the `match_ended` handler. Also fixed:
   `Gui.show` called `fullscreen(false)` when not fullscreen (console error on every screen).
   Verified with `npm run test:bots` (PASS) and a Playwright probe (scoreboard toggle, feed
   entry with weapon, ping in snapshot, results panel after a frag-limit-2 match, no page
   errors).
9. **Loot drops** (owner: "random loot drop, one package, only one box per location") –
   `GameEngine.setupLootSpots` turns every CrateSpawn object into a location; `dropLoot`
   (server, every tick) lands ONE random package on ONE random free location every
   `CFG.LOOT.DROP_INTERVAL` (4-9 s, first after 3 s), capped at `MAX_ACTIVE_RATIO` of the
   locations (min 3); `collectItem` frees the location; `clearMap` / round start reset all.
   Replaces the old "spawn every box at a random area of its layer + respawn 15 s after
   pick-up" (`_itemRespawns`, `CFG.ITEM_RESPAWN_TIME` removed), which stacked several boxes on
   one spot. `spawn()` takes an optional `area` to pin the position. Verified with a fake-clock
   engine test on all four maps (no location ever held two boxes, boxes always inside their
   location, occupancy never above the cap) and `npm run test:bots` (PASS).

## Open items / where to continue

- **Cloud Run is still private (403).** Run once (Claude Code's safety filter refused to
  grant public access itself):
  `gcloud run services add-iam-policy-binding strafeshooter --region europe-central2 --project strafeshooter-ostap --member=allUsers --role=roles/run.invoker`
  Redeploy after code changes: `gcloud run deploy strafeshooter --source . --region europe-central2 --project strafeshooter-ostap`
- **Unanswered question from the owner**: does the movement still "jump" (judder) after the
  frame-cap / camera fixes (monitor refresh rate?). ("Loot drop" is answered: item 9.)
- The owner did not know what the Cloud Run IAM command (above) is about; explain it when
  asked: it makes the deployed URL reachable without a Google login.
- Pre-existing oddity seen while probing: after a match ends and bots auto-start the next one,
  the "Runda N" countdown is drawn under the spectate panel for the human who is now a spectator.
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
