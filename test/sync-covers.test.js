// test/sync-covers.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sha1Hex } = require('../cover-mirror');
const { migrateYearFile } = require('../sync-covers');

test('migrateYearFile 只替换封面字符串并写回', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-covers-'));
  const coversDir = path.join(dir, 'covers');
  fs.mkdirSync(coversDir);
  const url = 'https://neodb.social/m/book/abc.jpg';
  const hash = sha1Hex(url);
  fs.writeFileSync(path.join(coversDir, hash + '.jpg'), 'x');
  const file = path.join(dir, '2026_reading_tracker.html');
  const originalHtml =
    '<html><body><script>const books = [{"title":"A","cover":"' + url + '"}];</script></body></html>';
  fs.writeFileSync(file, originalHtml, 'utf8');
  const result = await migrateYearFile(file, { coversDir, repoSlug: '' });
  const html = fs.readFileSync(file, 'utf8');
  assert.equal(result.changed, true);
  assert.equal(result.synced, 1);
  assert.ok(!html.includes(url));
  assert.ok(html.includes(hash + '.jpg'));
  assert.ok(html.includes('</script>'));
});
