# Games

Small browser games, deployed to GitHub Pages on every push to `main`.

**Play:** https://raemone.github.io/Games/

One of them has a backend: Roxy Run's world board runs as Vercel functions,
which deploy from the game's own directory. Everything else is static and stays
that way.

---

## Roxy Run

A pixel-art platformer starring Roxy the golden retriever. Momentum physics,
real slopes, rolling and a spin dash, across three worlds of three levels.
Built with TypeScript and canvas — no game engine, no runtime dependencies.

**Play it:** https://raemone.github.io/Games/roxy-run/

Best on a phone or tablet held sideways. Add it to the home screen and it
installs as an app and works offline.

### Controls

| | Keyboard | Touch |
|---|---|---|
| Run | Arrows or A/D | Left/right pads |
| Jump | Space, Z or X | Chevron button |
| Roll | Down | Down button |
| Spin dash | Hold Down, tap Jump | Hold Down, tap Jump |
| Pause | Esc or P | Pause icon |

Gamepads work too.

### How it plays

Bones are this game's rings. Getting hit scatters them instead of killing you,
so a mistake costs progress rather than a life — which is the difference between
a young player trying again and giving up. You only lose a life if something
hits you with no bones in hand, or you fall down a pit.

Score comes from bones, from bopping enemies (100/200/500/1000 for a chain in
one jump), and from a time-and-bones bonus at the goal. Best score and best time
per level are saved.

### Where things live

```
games/roxy-run/
  src/engine/     loop, renderer, input, audio, camera, save, world board
  src/game/       physics, collision, entities, scoring, drawing, screens
  src/levels/     ASCII level segments and the nine level definitions
  api/            the leaderboard's two Vercel functions
  server/         what those functions are made of - rules, storage, CORS
  tools/          the art pipeline, and a local runner for the API
```

The interesting parts are `src/game/collision.ts` (tile height masks, so ramps
are real geometry) and `src/game/physics.ts` (Mega Drive momentum constants).
Both are pure functions over plain data, which is why the feel is unit tested.

### Working on it

```bash
cd games/roxy-run
npm install
npm run dev      # local dev server
npm test         # unit tests and level playthroughs
npm run build    # type-check and production build
npm run art      # regenerate the sprite PNGs from tools/
npm run serve    # the leaderboard API on localhost, no Vercel CLI needed
```

The world board points at the deployed API by default. To develop against a
local one, run `npm run serve` in another terminal and start the game with
`VITE_LEADERBOARD_URL=http://localhost:3001 npm run dev`; use
`VITE_LEADERBOARD_URL=off` to build with no board at all.

Levels are ASCII art. `src/levels/segments.ts` holds reusable 24x20 tile chunks
and `src/levels/index.ts` lists which chunks each level is made of, so a new
level is a line of names. A test asserts every segment joins flush to its
neighbours and that a bot can run each level from start to goal.

Roxy's sprites are generated, not drawn by hand: `tools/roxy.mjs` composes her
from shapes, and `npm run art` writes the sheets and a TypeScript index of where
each animation sits. Editing a number in that file and re-running it repaints
every frame.

### The world board

Every level has a global top ten, open from the level select screen. It is the
one part of this repository with a backend: a Vercel function and a Redis
sorted set, in `api/` and `server/` inside the game's own directory, documented
in [API.md](games/roxy-run/API.md). It reaches Redis over REST or over a
socket, whichever the attached database offers.

They live in the game's directory because that is the directory Vercel deploys:
the same project serves the game and its API, which means one deployment rather
than two, and lets the server validate against the game's real level table
instead of a copy that could drift.

A run is posted as a score, a time and up to three characters. No name, no
account, no email — initials are the arcade convention this game is already
pretending to be from, they need no keyboard on a tablet, and they are the least
a leaderboard can know while still being a leaderboard. A device is a random id
generated on first play and kept in `localStorage`; clearing the browser's data
makes a new player, which is the honest trade for having no accounts at all.

Nothing is posted until someone says so. The first time there is a run to send,
the game asks once — at the end of a level, where the question is about
something concrete rather than a settings toggle nobody reads — and remembers
the answer. Answer no and the game never mentions it again; both the answer and
the initials can be changed from the board screen afterwards.

Everything about it degrades rather than breaks. A request that fails, times out
or comes back malformed becomes "could not reach the board" rather than an
error, and the game never waits for the network to show a result. The board it
talks to is the default, so the feature works out of the box;
`VITE_LEADERBOARD_URL` points a build at a different one, and `off` builds a
game with no board at all and no code path that tries. The results panel appears the moment a level ends, and the rank
arrives a second later if it arrives.

What stops someone posting a score they never earned is worth being straight
about: plausibility checks and rate limits, not proof. The
[API.md](games/roxy-run/API.md) says exactly what is enforced and what it would
take to do better.

### Saving

Progress is kept in the browser's `localStorage`, on the device. There is no
account, so nothing about who is playing ever leaves the tablet except a run you
explicitly post to the world board. The trade-off is that progress does not
follow you from one device to another.

---

## Poop Patrol

A backyard chore tracker for the family: who picked up after Roxy, on which
day, and how many. Points, streaks, badges and a Monday-to-Sunday leaderboard,
plus a weekly family goal so it is not purely a competition.

**Open it:** https://raemone.github.io/Games/poop-patrol/

Best on a phone. Add it to the home screen and it installs as an app and works
offline.

### How it scores

Every pickup is 10 points. Log something two days running and a daily streak
bonus kicks in, growing by 5 a day up to +25 — so turning up every day matters
more than one big Saturday. A streak stays alive as long as the last logged day
is today or yesterday, which means nobody loses a streak at breakfast before
they have had a chance to defend it.

The board resets every Monday. Ties share a rank, so two people who did
identical work see identical medals, and below the medals everyone who scored
gets a star — there is no last place. The family goal sits above the
leaderboard on purpose: the team win is the main event.

### What the points buy

Points are a wallet as well as a score. The three smaller rewards are bought
with them, over and over:

| | Reward | Price |
|---|---|---|
| 📺 | 1 hour of screen time — TV, Switch or tablet | 100 pts |
| 🍗 | Chick-fil-A lunch | 400 pts |
| 🕹️ | MPB — an afternoon at the arcade in my parents' basement | 800 pts |

The two big ones are not for sale. They count the days that person has picked
something up — **in total, not in a row** — and can only be won once:

| | Reward | Needs |
|---|---|---|
| 📱 | A cellphone | 100 days of picking up |
| 🎮 | A Nintendo Switch 2 | 200 days of picking up |

Total days rather than consecutive ones because the family travels. A hundred-day
unbroken run is not a goal, it is a guarantee of failure: one trip out of state
and it is gone for good, with nothing to show for the ninety days before it.
Counting days instead means a fortnight away costs progress but never destroys
it.

Every reward is editable in the app — add your own, rename them, re-price them,
or take them off the list. Removing one archives it rather than deleting it, so
points already spent on it stay spent.

The distinction that matters is between points **earned** and points **spent**.
Earned points are the score — they drive the leaderboard and the career rank and
they never go down. The balance is earned minus spent, and that is what the shop
charges. If redeeming a lunch cost a child their place on the leaderboard, the
sensible move would be to never redeem anything.

Prices are calibrated against what the scoring actually pays: coming back day
after day, a child earns roughly 170 points a week at one pickup a day and 310 at
three. So screen time lands every few days, lunch is a fortnight's work, and MPB is a
monthly treat. A single day of pickups is worth 10 to 30 points, so
it still buys nothing at all — which was the rule the family set. Every price is
editable in settings, because you will want to tune them once you see how fast
the kids really earn.

A claim records what it actually cost, so re-pricing a reward later never
rewrites what past redemptions were worth.

The daily streak still exists, but only as the points bonus — it caps after six
days and rebuilds in under a week, so a holiday costs a little and nothing more.

### Where things live

```
games/poop-patrol/
  src/core/   dates, save data, reducer, scoring, streaks, leaderboard,
              badges, rewards
  src/ui/     screens, rendering, sound and animation
  tools/      the icon generator: pixel data in, PNGs out
```

Everything under `src/core/` is pure — no DOM, no clock, no locale — which is
why the scoring rules are unit tested rather than eyeballed. `src/core/dates.ts`
is the one to read first: day keys are local calendar dates and every date sum
is integer arithmetic on those keys, because anything touching `toISOString` or
adding 24 hours files a Saturday evening pickup on Sunday.

Nothing gamified is stored. Badges, ranks and streaks are derived from the log
on every render, which is why backfilling a day you forgot repairs a broken
streak and hands out the badge retroactively.

### Working on it

```bash
cd games/poop-patrol
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run build    # type-check and production build
npm run icon     # regenerate the app icons
```

### Saving

Everything is kept in the browser's `localStorage`, on the one device the
family logs from. There is no server and no account, so two phones would keep
two separate histories — pick a device and stick to it.

Settings has a backup button that copies the whole history as JSON. Worth doing
occasionally: clearing the browser's data would take the streaks with it, and a
browser that is not installed to the home screen can evict storage on its own
after a couple of unused weeks.
