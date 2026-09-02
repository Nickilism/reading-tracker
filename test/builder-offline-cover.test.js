// test/builder-offline-cover.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { encodeLocalCover } = require('../builder_offline');

test('encodeLocalCover 读取本地封面转 data URI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-cover-'));
  fs.mkdirSync(path.join(dir, 'covers'));
  fs.writeFileSync(path.join(dir, 'covers', 'a.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
  const uri = encodeLocalCover('../covers/a.jpg', dir);
  assert.match(uri, /^data:image\/jpeg;base64,/);
  assert.ok(uri.length > 'data:image/jpeg;base64,'.length);
});

test('encodeLocalCover 拒绝 covers/ 之外路径', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-cover-'));
  fs.writeFileSync(path.join(dir, 'x.png'), 'x');
  assert.throws(() => encodeLocalCover('../x.png', dir), /未知本地封面路径/);
});

test('encodeLocalCover 拒绝路径穿越', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-cover-'));
  fs.writeFileSync(path.join(dir, 'x.png'), 'x');
  assert.throws(() => encodeLocalCover('../covers/../x.png', dir), /未知本地封面路径/);
});
