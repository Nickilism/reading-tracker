// test/cover-mirror.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sha1Hex, extFromUrl, extFromContentType, resolveOwnRaw, coverFileName
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
