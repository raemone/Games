/**
 * Run the API locally, without the Vercel CLI.
 *
 * `vercel dev` is the real thing, but it wants a global CLI and a logged-in
 * account, which is a lot to ask of anyone who just wants to see the board
 * working next to the game. This does the one thing that matters: map a URL to
 * the matching file in `api/`, hand it a Request, and write back the Response.
 *
 *   node --experimental-transform-types tools/serve.mjs [port]
 *
 * With no database configured it uses the in-memory store, so the board fills
 * up as you play and empties when you stop the server.
 */
import { createServer } from 'node:http';
import { register } from 'node:module';
import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// Registered before the first route is imported, so extensionless imports
// inside the functions resolve.
register('./ts-resolve.mjs', import.meta.url);

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'api');
const PORT = Number(process.argv[2] ?? 3001);

/** Turn a Node request into the Request object a Vercel function is given. */
async function toRequest(req) {
  const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;
  const method = req.method ?? 'GET';
  const body =
    method === 'GET' || method === 'HEAD'
      ? undefined
      : await new Promise((resolve) => {
          const chunks = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', () => resolve(Buffer.concat(chunks)));
        });
  return new Request(url, { method, headers: req.headers, body });
}

async function send(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

const routes = new Set(
  (await readdir(API_DIR)).filter((name) => name.endsWith('.ts')).map((name) => name.replace(/\.ts$/, '')),
);

createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  const name = path.replace(/^\/api\//, '').replace(/\/$/, '');

  if (!path.startsWith('/api/') || !routes.has(name)) {
    res.statusCode = 404;
    res.end(`no route for ${path} - try ${[...routes].map((r) => `/api/${r}`).join(', ')}`);
    return;
  }

  try {
    const module = await import(pathToFileURL(join(API_DIR, `${name}.ts`)).href);
    const handler = module[req.method ?? 'GET'];
    if (typeof handler !== 'function') {
      res.statusCode = 405;
      res.end(`${req.method} not allowed on /api/${name}`);
      return;
    }
    await send(res, await handler(await toRequest(req)));
  } catch (error) {
    // A crash here is a bug in the function, so say so loudly rather than
    // returning a tidy 500 that looks like a rejected score.
    console.error(error);
    res.statusCode = 500;
    res.end(String(error));
  }
}).listen(PORT, () => {
  console.log(`Roxy Run leaderboard on http://localhost:${PORT}/api/leaderboard?level=w1-1`);
});
