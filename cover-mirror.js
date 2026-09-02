// cover-mirror.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const DEFAULT_COVERS_DIR = 'covers';
const PAGE_PREFIX = '../';
const MAX_COVER_BYTES = 10 * 1024 * 1024;

function sha1Hex(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

function extFromContentType(contentType) {
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  if (!contentType) return null;
  const type = contentType.split(';')[0].trim().toLowerCase();
  return map[type] || null;
}

function extFromUrl(url) {
  try {
    const m = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif)$/i);
    if (!m) return null;
    return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  } catch (_) {
    return null;
  }
}

function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY.toLowerCase();
  try {
    const child = require('child_process');
    const out = child.execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const m = out.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (m) return (m[1] + '/' + m[2]).toLowerCase();
  } catch (_) {}
  return '';
}

function resolveOwnRaw(url, repo) {
  if (!/^https?:\/\//i.test(url)) return null;
  let parsed;
  try { parsed = new URL(url); } catch (_) { return null; }
  if (parsed.hostname.toLowerCase() !== 'raw.githubusercontent.com') return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 4) return null;
  const remoteSlug = (parts[0] + '/' + parts[1]).toLowerCase();
  if (repo && remoteSlug !== repo.toLowerCase()) return null;
  const projectPath = parts.slice(3).map(decodeURIComponent).join('/');
  if (!projectPath.startsWith('covers/')) return null;
  return projectPath;
}

function coverFileName(url) {
  return DEFAULT_COVERS_DIR + '/' + sha1Hex(url) + '.' + (extFromUrl(url) || 'jpg');
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function findCoverFile(hash, coversDir) {
  if (!fs.existsSync(coversDir)) return null;
  const match = fs.readdirSync(coversDir).find((name) => name.startsWith(hash + '.'));
  return match ? toPosix(path.join(coversDir, match)) : null;
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const get = (target) => {
      const req = https.get(target, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (++redirects > 5) {
            reject(new Error('重定向次数过多: ' + url));
            return;
          }
          get(new URL(res.headers.location, target).toString());
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('HTTP ' + res.statusCode + ': ' + url));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > MAX_COVER_BYTES) {
            req.destroy();
            reject(new Error('封面超过 10MB: ' + url));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => {
          resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' });
        });
      });
      req.setTimeout(30000, () => req.destroy(new Error('Timeout: ' + url)));
      req.on('error', reject);
    };
    get(url);
  });
}

async function ensureCover(url, opts = {}) {
  if (!/^https?:\/\//i.test(url)) return null;
  const coversDir = opts.coversDir || DEFAULT_COVERS_DIR;
  const download = opts.download || downloadImage;
  const hash = sha1Hex(url);
  const existing = findCoverFile(hash, coversDir);
  if (existing) return existing;
  const { buffer, contentType } = await download(url);
  if (!contentType || !/^image\//i.test(contentType)) {
    throw new Error('非图片响应: ' + url);
  }
  if (buffer.length > MAX_COVER_BYTES) {
    throw new Error('封面超过 10MB: ' + url);
  }
  const ext = extFromContentType(contentType) || extFromUrl(url) || 'jpg';
  const outPath = path.join(coversDir, hash + '.' + ext);
  fs.mkdirSync(coversDir, { recursive: true });
  fs.writeFileSync(outPath, buffer);
  return toPosix(outPath);
}

async function mirrorCovers(books, opts = {}) {
  const coversDir = opts.coversDir || DEFAULT_COVERS_DIR;
  const repo = opts.repoSlug === undefined ? repoSlug() : opts.repoSlug;
  for (const book of books) {
    const url = book.cover;
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const ownPath = resolveOwnRaw(url, repo);
    if (ownPath && fs.existsSync(ownPath)) {
      book.cover = PAGE_PREFIX + ownPath;
      continue;
    }
    try {
      const localPath = await ensureCover(url, {
        coversDir,
        download: opts.download
      });
      if (localPath) book.cover = PAGE_PREFIX + localPath;
    } catch (err) {
      console.warn('  封面镜像失败，保留原链接: ' + (book.title || '(未命名)') + ' - ' + err.message);
    }
  }
}

module.exports = {
  sha1Hex, extFromContentType, extFromUrl, repoSlug, resolveOwnRaw,
  coverFileName, toPosix, findCoverFile, downloadImage, ensureCover, mirrorCovers,
  DEFAULT_COVERS_DIR, PAGE_PREFIX, MAX_COVER_BYTES
};
