# Mini Drifters game server

A small WebSocket relay for multiplayer. Races and the Open rooms list go through this server instead of
peer-to-peer, so it's smoother, works on Wi-Fi that blocks peer-to-peer, and handles far more players.
Leaderboards and accounts still use Supabase (that part isn't real-time, so it doesn't cause lag).

## Easiest: Render (free)
1. Put this `server` folder in its own GitHub repo (e.g. `minidrifters-server`).
2. On https://render.com sign in with GitHub → **New → Blueprint** → pick the repo (it reads `render.yaml`).
3. When it's live you get a URL like `https://minidrifters-server.onrender.com`.
4. In the dev dashboard → Settings, paste it into **Game server URL** and publish. (Or edit `js/config.js`:
   `GAME_SERVER: 'wss://minidrifters-server.onrender.com'`.)

The free plan sleeps after 15 minutes with nobody on it; the first person to open Multiplayer wakes it
(takes up to about a minute). The game shows "waking the server up" while that happens.

## Lowest lag in the UK: Fly.io (London)
Needs a card, costs a few pence/pounds a month for this size.
```
fly launch --copy-config --no-deploy
fly deploy
```
URL: `wss://<your-app>.fly.dev`

## Railway / any VPS
It's a normal Node app: `npm install && npm start`, listens on `$PORT` (default 8080). A Dockerfile is included.

## Check it
Open the URL in a browser: it should say `Mini Drifters server OK`. `/rooms` lists open rooms.
