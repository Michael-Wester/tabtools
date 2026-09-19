'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');

const root = path.resolve(process.env.STATIC_ROOT || path.join(__dirname, '..', 'website', 'dist'));
const portArgument = process.argv.indexOf('--port');
const port = Number(process.env.PORT || (portArgument >= 0 ? process.argv[portArgument + 1] : 4173));

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`Invalid port: ${port}`);
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function response(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

async function fileForRequest(requestUrl, realRoot) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  } catch (_) {
    return { status: 400 };
  }

  if (!pathname.startsWith('/') || pathname.includes('\0')) return { status: 400 };
  const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const candidate = path.resolve(root, `.${relative}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return { status: 403 };

  let filePath = candidate;
  try {
    if ((await fs.promises.stat(filePath)).isDirectory()) filePath = path.join(filePath, 'index.html');
    const realPath = await fs.promises.realpath(filePath);
    if (realPath !== realRoot && !realPath.startsWith(`${realRoot}${path.sep}`)) return { status: 403 };
    const stat = await fs.promises.stat(realPath);
    if (!stat.isFile()) return { status: 404 };
    return { path: realPath, stat };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return { status: 404 };
    throw error;
  }
}

async function main() {
  const realRoot = await fs.promises.realpath(root);
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      response(res, 405, 'Method Not Allowed\n');
      return;
    }

    try {
      const result = await fileForRequest(req.url || '/', realRoot);
      if (result.status) {
        response(res, result.status, `${result.status === 404 ? 'Not Found' : 'Bad Request'}\n`);
        return;
      }

      const contentType = contentTypes[path.extname(result.path).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': contentType,
        'Content-Length': result.stat.size
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(result.path).on('error', error => res.destroy(error)).pipe(res);
    } catch (error) {
      response(res, 500, 'Internal Server Error\n');
    }
  });

  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    console.log(`Serving ${realRoot} at http://127.0.0.1:${address.port}`);
  });
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
