# Games

Small browser games, deployed to GitHub Pages on every push to `main`.

**Play:** https://raemone.github.io/Games/

## Roxy Run

A pixel-art platformer starring Roxy the golden retriever — momentum physics, slopes,
rolling and three worlds. Built with TypeScript and canvas, no game engine, no runtime
dependencies.

```bash
cd games/roxy-run
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run build    # type-check + production build
npm run art      # regenerate sprite PNGs from the pixel data in tools/
```

Progress is saved in the browser's `localStorage` on the device. There is no server and
no account — nothing about who is playing leaves the device.
