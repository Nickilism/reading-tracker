// test/cover-mirror.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  sha1Hex, extFromUrl, extFromContentType, resolveOwnRaw, coverFileName,
  ensureCover, mirrorCovers
} = require('../cover-mirror');

test('sha1Hex 稳定且区分不同 URL', () => {
  const a = sha1Hex('https://neodb.social/m/book/1.jpg');
  const b = sha1Hex('https://neodb.social/m/book/2.jpg');
  assert.equal(a.length, 40);
  assert.equal(a, sha1Hex('https://neodb.social/m/book/1.jpg'));
  assert.notEqual(a, b);
});

test('extFromUrl 识别常见图片扩展名', () => {
  assert.equal(extFromUrl('https://x/a.jpg'), 'jpg');
  assert.equal(extFromUrl('https://x/a.JPEG'), 'jpg');
  assert.equal(extFromUrl('https://x/a.png'), 'png');
  assert.equal(extFromUrl('https://x/a.webp'), 'webp');
  assert.equal(extFromUrl('https://x/a'), null);
});

test('extFromContentType 映射 MIME 到扩展名', () => {
  assert.equal(extFromContentType('image/png'), 'png');
  assert.equal(extFromContentType('image/webp; charset=binary'), 'webp');
  assert.equal(extFromContentType('text/html'), null);
  assert.equal(extFromContentType(''), null);
});

test('resolveOwnRaw 识别本仓库 covers raw 链接', () => {
  const repo = 'nickilism/reading-tracker';
  const raw = 'https://raw.githubusercontent.com/Nickilism/reading-tracker/main/covers/%E4%B9%A6.jpg';
  assert.equal(resolveOwnRaw(raw, repo), 'covers/书.jpg');
  assert.equal(resolveOwnRaw('https://raw.githubusercontent.com/other/repo/main/covers/x.jpg', repo), null);
  assert.equal(resolveOwnRaw('https://neodb.social/m/book/1.jpg', repo), null);
  assert.equal(resolveOwnRaw('https://raw.githubusercontent.com/Nickilism/reading-tracker/main/icons/favicon.ico', repo), null);
});

test('coverFileName 由 URL 哈希与扩展名组成', () => {
  const url = 'https://neodb.social/m/book/abc.jpg';
  const name = coverFileName(url);
  assert.equal(name, 'covers/' + sha1Hex(url) + '.jpg');
});

const fs = require('node:fs');
const os = require('node:os');

test('ensureCover 已存在文件时不下载', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covers-mirror-'));
  const hash = sha1Hex('https://example.com/a.jpg');
  fs.writeFileSync(path.join(dir, hash + '.jpg'), 'x');
  let downloads = 0;
  const rel = await ensureCover('https://example.com/a.jpg', {
    coversDir: dir,
    download: async () => { downloads++; throw new Error('should not download'); }
  });
  assert.equal(downloads, 0);
  assert.ok(rel.endsWith(hash + '.jpg'));
});

test('ensureCover 下载写入并按 content-type 定扩展名', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covers-mirror-'));
  const url = 'https://example.com/noext';
  const hash = sha1Hex(url);
  const rel = await ensureCover(url, {
    coversDir: dir,
    download: async () => ({ buffer: Buffer.from([1, 2, 3]), contentType: 'image/png' })
  });
  assert.ok(rel.endsWith(hash + '.png'));
  assert.equal(fs.readFileSync(path.join(dir, hash + '.png')).length, 3);
});

test('ensureCover 拒绝非图片响应', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covers-mirror-'));
  await assert.rejects(
    ensureCover('https://example.com/a', {
      coversDir: dir,
      download: async () => ({ buffer: Buffer.from('x'), contentType: 'text/html' })
    }),
    /非图片响应/
  );
});

test('mirrorCovers 成功改写为本地相对路径', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covers-mirror-'));
  const url = 'https://example.com/b.jpg';
  const hash = sha1Hex(url);
  fs.writeFileSync(path.join(dir, hash + '.jpg'), 'x');
  const books = [{ title: 'B', cover: url }];
  await mirrorCovers(books, { coversDir: dir, repoSlug: '' });
  assert.ok(books[0].cover.includes(hash + '.jpg'));
  assert.ok(books[0].cover.startsWith('../'));
});

test('mirrorCovers 下载失败保留原链接', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'covers-mirror-'));
  const url = 'https://example.com/c.jpg';
  const books = [{ title: 'C', cover: url }];
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await mirrorCovers(books, {
      coversDir: dir,
      repoSlug: '',
      download: async () => { throw new Error('boom'); }
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(books[0].cover, url);
});
