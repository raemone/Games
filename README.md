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

The title screen shows who is ahead across every level, and each level has its
own global top ten, open from the level select screen. It is the
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
a leaderboard can know while still being a leaderboard.

The initials are the player, not the tablet. One tablet gets passed between
children, so each set of initials keeps its own id and its own scores, and
typing a set again returns to that player. Ids are random, made on the device
and kept in `localStorage`; clearing the browser's data makes new players of
everyone, which is the honest trade for having no accounts at all. The flip
side is that initials cannot be corrected afterwards - changing them is
becoming somebody else, which is precisely what stops one child's turn from
renaming their sibling's scores.

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

There is no way to erase it from inside the game. A button for that is one
mis-tap away from destroying a sibling's progress, and clearing the browser's
data does the same job on the rare occasion anyone means it.

---

## Roxy Pinball

A pinball table in the back garden, rendered in 3D, with Roxy on the playfield
and six missions to work through. A steel ball with real spin, a launch channel
that rewards a measured plunge, a global leaderboard, and a squirrel who has no
business being on that fence.

**Play it:** https://raemone.github.io/Games/roxy-pinball/

The copy on Vercel is the one with the global board; see *The leaderboard*
below. The Pages copy plays identically and can read the board, but cannot post
to it.

Best on a phone held upright. Add it to the home screen and it installs as an
app and works offline. Roxy is a lean female golden retriever, and every
appearance of her - the attract screen, the playfield art, the apron, the app
icon - comes from the same `src/game/roxy.ts`, so there is exactly one of her.

### Controls

| | Keyboard | Touch |
|---|---|---|
| Left flipper | Left arrow, A, Z or left Shift | Tap anywhere on the left half |
| Right flipper | Right arrow, D, / or right Shift | Tap anywhere on the right half |
| Plunger | Hold and release Space or Down | Hold and release PULL |
| Nudge | Q, W and E | The two NUDGE buttons |
| Pause | Esc or P | Pause icon |

Gamepads work too. The flippers are the whole left and right halves of the
screen rather than two small buttons, because a thumb hunting for a target is
a thumb that is not watching the ball.

### How it plays

Three balls. The first twelve seconds of each are covered by a ball save, so a
bad plunge is not the end of a turn.

Shooting the doghouse starts whichever mission is flashing on the playfield,
and shooting it during the six seconds after a launch is the skill shot
instead. Missions are timed, but running out of time is not a punishment: the
progress is kept, so the next attempt picks up where the last one stopped.

| Mission | What it wants |
|---|---|
| Fetch! | Either orbit, three times |
| Squirrel Chase | Five hits on the squirrel |
| Walkies | The orbits alternately - left, right, left, right |
| Dinner Time | Twenty-four bumper hits |
| Bath Time | All four brushes dropped |
| Bury the Bone | The doghouse, three times |

Finish all six and Best in Show lights at the doghouse: three balls at once,
with everything on the table paying a jackpot.

Rolling through R-O-X-Y at the top steps the bonus multiplier up. That
multiplier is not the score - it multiplies the bones collected during the
ball, which are cashed in when it drains. Two currencies rather than one, so a
ball that ends badly still pays for the shots that were made before the drain,
which is the difference between a child trying again and putting the tablet
down.

Nudging shoves the ball. Four shoves in quick succession tilts, and a tilted
table has dead flippers until the ball drains - the same bargain a real machine
offers.

### The ball

The ball is a rigid sphere, not a point. It carries an angular velocity, and
every contact applies a Coulomb friction impulse alongside the normal one, so it
spins up as it rolls, takes sidespin off a rubber and carries that spin into the
next bounce. It has a height as well, which is zero nearly all the time - a
pinball rarely leaves the wood - but lets a slingshot pop it into the air.

That is not decoration, and it sets most of the numbers on the table. A rolling
sphere accelerates down a slope at five sevenths of the rate a sliding one does,
because two sevenths of the work goes into spinning it up, so gravity is 0.308
to leave 0.22 where the table was laid out against. A ball fired up the lane
with no spin loses a third of its energy sliding before it rolls, so the plunger
hands it the matching spin, the way a real lane does within an inch of the tip.

Two more details are load-bearing and easy to undo by accident. The simulation
runs six collision passes per tick, chosen so a ball at full speed moves less
than its own radius between passes and cannot pass through a wall. And there is
deliberately no rule that stops a slow ball: gravity adds about a
hundredth of a pixel per pass, so any threshold that zeroes small velocities
glues a resting ball to whatever it settled against and eats it.

### The leaderboard

Finishing a game offers to put the score on a global board, and the attract
screen shows the top of it. It is a Vercel Edge Function over one Upstash Redis
sorted set - which is what a leaderboard is, so the top twenty and a player's
rank are each a single command with no schema and nothing to migrate.

Everything about it is optional at runtime. No network, no board deployed, a
request that times out: the game plays exactly the same and the attract screen
falls back to this device's own high scores. A tablet in a back garden with no
signal was the case to get right, so nothing in `src/engine/leaderboard.ts`
throws and every request has a six-second deadline.

The checks on a submission are deliberately light - a rate limit per address, a
plausible score ceiling, a floor on how fast three balls can be played, and a
name filter. Anyone can POST to a public endpoint and no amount of validation
makes that untrue; these keep out casual nonsense without pretending to be
security. The honest fix, if the board ever mattered more than this, would be to
send the input log and re-simulate it server-side, which the fixed-timestep
physics would make possible.

**To deploy it:** make a Vercel project from this repo with the root directory
set to `games/roxy-pinball`, the way `roxy-run` and `poop-patrol` already are.
Add an Upstash Redis store from the Vercel marketplace, which sets
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for you. There is
nothing else: `vercel.json` and `api/scores.ts` are already here, and Vercel
sets `VERCEL=1` during the build, which is how `vite.config.ts` knows to serve
from `/` rather than from the `/Games/roxy-pinball/` path Pages uses.

### Where things live

```
games/roxy-pinball/
  api/          the leaderboard endpoint, one Edge Function
  src/engine/   loop, renderer, input, audio, storage, leaderboard
  src/game/     physics, table geometry, missions, scoring, session, artwork
  src/render/   the three.js scene
  tools/        the icon generator, and two offline views of the table
```

`src/game/physics.ts` and `src/game/table.ts` are the pair worth reading first.
The physics knows only that something with an id was hit; the table is every
coordinate on the playfield, written once, so moving a bumper moves the thing
the ball hits, the thing on screen and the thing a mission asks for together -
`src/render/scene.ts` builds its walls by reading `staticColliders()`, so the
picture cannot drift from the collision. `src/game/missions.ts` and
`src/game/scoring.ts` are pure functions over plain data, which is why a whole
mission can be played out in a test in a dozen lines.

The artwork splits in two. What is printed on the wood and never moves - the
backyard, the fence, Roxy, the lamp housings and their lettering - is ordinary
2D canvas code in `src/game/playfield-art.ts`, drawn once and handed over as a
texture. What moves or lights up is a real object above it. three.js is the only
runtime dependency the repo has, and it takes the bundle from 20KB to 150KB
gzipped; the game still loads as one request and still works offline.

### Working on it

```bash
cd games/roxy-pinball
npm install
npm run dev      # local dev server
npm test         # unit tests, and a sweep of every shot on the table
npm run build    # type-check and production build
npm run icon     # regenerate the app icons
npm run table    # draw the playfield's collision geometry to a PNG
npm run sim      # trace one ball through the real physics, to a PNG
```

`npm test` includes the playthrough test: it fires a ball off both flippers
from every contact point and release time, and fails if any shot on the table
cannot be reached or if a ball can come to rest somewhere it cannot get out of.
That test is how the table was built - `npm run table` and `npm run sim` draw
what it is checking, for when a number needs moving by eye.

### Saving

High scores, the remembered name and the sound setting are kept in the browser's
`localStorage`, on the device, so the table on the phone and the table on the
iPad keep separate local high scores.

The only thing that ever leaves the device is a score the player chooses to
submit: a name they typed, the score, how many missions they finished, how long
the game lasted and the date. There is no account and nothing is tracked.

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
