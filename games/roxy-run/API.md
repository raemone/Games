# The world board API

The leaderboard behind Roxy Run: two functions and a Redis sorted set, with no
runtime dependencies.

```
games/roxy-run/
  api/            the functions themselves - one file per route
  server/         rules and storage, which is where the actual thinking is
  test/server/    their tests
  tools/serve.mjs a local runner, so the API works without the Vercel CLI
```

It lives inside the game's directory rather than beside it because that is the
directory Vercel deploys: one project serves both, so there is one deployment
to keep alive instead of two, and the server validates against the game's real
level table (`src/levels`) instead of a copy that could drift from it.

Note what this does *not* buy: the family plays on GitHub Pages, so a player's
request is still cross-origin. That is why CORS gets as much attention as it
does in `server/http.ts`, and why `api/leaderboard.ts` has a test asserting the
headers on a *successful* POST - a reply the browser cannot read looks, from the
game's side, exactly like a rejected score.

## The API

| | |
|---|---|
| `GET /api/leaderboard?level=w1-1&limit=10&player=<id>` | The top runs on a level. `player` adds that device's own standing, even when it is off the end of the page. |
| `POST /api/leaderboard` | Post a run. Answers with where it landed. |
| `GET /api/health` | Whether a database is actually attached. |

A posted run is `{ levelId, playerId, initials, score, timeMs }`. The player id
is sixteen hex characters the game generates once and keeps in `localStorage`;
the initials are one to three characters of `A-Z0-9`. There is no account, no
name and no email — this is the whole of what the board knows about anyone.

Boards are per level. A single table across nine levels would reward grinding
the most generous one, and the question a child actually has is who is fastest
on the level they are stuck on.

## Running it locally

```bash
cd games/roxy-run
npm install
npm test         # the game's tests and the API's, in one suite
npm run build    # type-check and build
npm run serve    # http://localhost:3001, no Vercel CLI needed
```

`npm run serve` maps a URL to the matching file in `api/` and hands it a
`Request`, which is all Vercel does for a function. With no database configured
it uses the in-memory store, so the board fills as you play and empties when you
stop the server. To see the game talking to it:

```bash
VITE_LEADERBOARD_URL=http://localhost:3001 npm run dev
```

## Deploying it

1. A Vercel project on this repository with its **Root Directory** set to
   `games/roxy-run`. This is what Vercel's monorepo detection creates on its
   own, and it is the project that serves the game, so `api/` deploys with it.
2. A Redis database on that project — Vercel KV, or Upstash from the
   marketplace. Either one sets the environment variables below for you.
3. Set `ALLOWED_ORIGINS` if the game is served from anywhere other than
   `https://raemone.github.io` (comma-separated; localhost dev ports are always
   allowed).
4. Nothing, if the deployment is `https://roxy-run.vercel.app` — that is the
   game's default. For a different origin, set the `LEADERBOARD_URL` repository
   **variable** (not a secret; it ends up in the client bundle) to it, or
   `off` to build a game with no board at all.

| Variable | |
|---|---|
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Set by Vercel KV. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Set by the Upstash integration. Either pair works. |
| `ALLOWED_ORIGINS` | Extra origins allowed to read the board. Optional. |

Check `/api/health` after deploying. `"storage":"memory"` means no database was
found: the API will answer every request happily and forget each one, which
from the game's side is indistinguishable from nobody having played yet.

## What stops a made-up score

Honestly: not as much as you would like, and it is better to say so than to
imply otherwise.

The game runs entirely in the browser, so the run that reaches this API is
whatever the browser chose to send. What the server does enforce is that a
submission names a real level, carries a well-formed player id and initials,
scores within a plausible range, and reports a time no faster than the level can
be run and no slower than its clock allows — plus twenty posts a minute per
address, so nobody can flood the table. Initials are checked against a short
blocklist, because this is a board a child reads.

That is enough to keep the board free of `999999999`, junk rows and spam, which
is what actually ruins a family leaderboard. It is not proof. An adult with the
network tab open can post a run they never played.

Making that impossible means the server has to be able to check the run itself —
sending the input trace with the score and replaying it against the same
deterministic physics the game uses, rejecting anything that does not reach the
goal. That is a real option here, because the physics is already pure functions
over plain data and already replayed in the game's own playthrough tests. It is
just a much larger piece of work than a leaderboard for nine people needs.

## Storage

Two sorted sets and a hash per level, all under a `roxy:v1:` prefix:

| Key | |
|---|---|
| `roxy:v1:score:<levelId>` | Best score per player. `ZADD GT`, so a worse run is a no-op. |
| `roxy:v1:time:<levelId>` | Best time per player. `ZADD LT`. |
| `roxy:v1:names` | Player id to initials. |
| `roxy:v1:rl:<key>:<window>` | Rate-limit counters, expiring on their own. |

Best score and best time are tracked separately and can come from different
runs, exactly as the game's own local records do. Redis breaks a score tie by
player id, which means nothing to a reader, so a page of results is re-sorted by
score and then by time once both numbers are in hand.
