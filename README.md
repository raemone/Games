# Games

Small browser games, deployed to GitHub Pages on every push to `main`.

**Play:** https://raemone.github.io/Games/

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
  src/engine/     loop, renderer, input, audio, camera, save
  src/game/       physics, collision, entities, scoring, drawing, screens
  src/levels/     ASCII level segments and the nine level definitions
  tools/          the art pipeline: pixel data in, PNGs out
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
```

Levels are ASCII art. `src/levels/segments.ts` holds reusable 24x20 tile chunks
and `src/levels/index.ts` lists which chunks each level is made of, so a new
level is a line of names. A test asserts every segment joins flush to its
neighbours and that a bot can run each level from start to goal.

Roxy's sprites are generated, not drawn by hand: `tools/roxy.mjs` composes her
from shapes, and `npm run art` writes the sheets and a TypeScript index of where
each animation sits. Editing a number in that file and re-running it repaints
every frame.

### Saving

Progress is kept in the browser's `localStorage`, on the device. There is no
server and no account, so nothing about who is playing ever leaves the tablet.
The trade-off is that progress does not follow you from one device to another.
