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

module.exports = {
  sha1Hex, extFromContentType, extFromUrl, repoSlug, resolveOwnRaw,
  coverFileName, toPosix, DEFAULT_COVERS_DIR, PAGE_PREFIX, MAX_COVER_BYTES
};
