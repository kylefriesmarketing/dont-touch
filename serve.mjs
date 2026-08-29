// DON'T TOUCH — serve.mjs   ·   node serve.mjs 8460
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const port = +(process.argv[2] || 8460);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = join(process.cwd(), normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const body = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (e) { res.writeHead(404); res.end('not here'); }
}).listen(port, () => console.log(`don't touch → http://localhost:${port}`));
