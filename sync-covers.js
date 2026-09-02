#!/usr/bin/env node
/**
 * sync-covers.js - 年度页封面迁移/同步工具
 *
 * 把 reading archive/<year>_reading_tracker.html 中仍是外链的封面
 * 原地替换为 ../covers/<file>，并下载缺失封面。
 *
 * 用法:
 *   node sync-covers.js          # 处理全部年份
 *   node sync-covers.js 2025     # 只处理 2025
 */

const fs = require('fs');
const path = require('path');
const { mirrorCovers } = require('./cover-mirror');

const ARCHIVE_DIR = 'reading archive';
const BOOKS_RE = /const books = (\[[\s\S]+?\]);/;

async function migrateYearFile(filePath, opts = {}) {
  const html = fs.readFileSync(filePath, 'utf8');
  const m = html.match(BOOKS_RE);
  if (!m) throw new Error('无法从 ' + filePath + ' 提取书籍数据');
  const books = eval('(' + m[1] + ')');
  const before = books.map((b) => b.cover);
  await mirrorCovers(books, opts);
  const pairs = [];
  books.forEach((b, i) => {
    if (b.cover !== before[i]) pairs.push([before[i], b.cover]);
  });
  if (pairs.length === 0) {
    return { filePath, changed: false, total: books.length, synced: 0 };
  }
  let output = html;
  let synced = 0;
  for (const [oldUrl, newValue] of pairs) {
    const quotedOld = JSON.stringify(oldUrl);
    const quotedNew = JSON.stringify(newValue);
    if (!output.includes(quotedOld)) {
      console.warn('  未找到可替换字符串: ' + oldUrl);
      continue;
    }
    output = output.split(quotedOld).join(quotedNew);
    synced++;
  }
  if (synced > 0) fs.writeFileSync(filePath, output, 'utf8');
  return { filePath, changed: synced > 0, total: books.length, synced };
}

async function main() {
  const yearArgs = process.argv.slice(2).filter((a) => /^\d{4}$/.test(a));
  const files = yearArgs.length
    ? yearArgs.map((y) => path.join(ARCHIVE_DIR, y + '_reading_tracker.html'))
    : fs.readdirSync(ARCHIVE_DIR)
        .filter((f) => /^\d{4}_reading_tracker\.html$/.test(f))
        .map((f) => path.join(ARCHIVE_DIR, f));
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.warn('跳过不存在的文件: ' + file);
      continue;
    }
    const year = path.basename(file).slice(0, 4);
    console.log('\n处理 ' + year + ' 年: ' + file);
    try {
      const r = await migrateYearFile(file);
      console.log('  共 ' + r.total + ' 本，成功改写 ' + r.synced + ' 个封面' + (r.changed ? '' : '（无变化）'));
    } catch (e) {
      console.warn('  处理失败: ' + e.message);
    }
  }
  console.log('\n完成。若存在失败封面，请查看上方警告后人工跟进。');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { migrateYearFile };
