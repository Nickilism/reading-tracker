#!/usr/bin/env node
/**
 * builder_offline.js
 * 生成完全自包含的离线阅读记录 HTML 文件
 *
 * 用法: node builder_offline.js [年份]
 * 示例: node builder_offline.js 2025
 *
 * 功能:
 *   从 {年份}_reading_tracker.html 读取书籍数据
 *   下载所有封面图片转为 base64
 *   生成 {年份}_reading_tracker_offline.html
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const YEAR = process.argv[2] || '2025';

// 下载文件并返回 base64
function downloadAndEncode(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout: ' + url)), 30000);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        clearTimeout(timeout);
        reject(new Error('HTTP ' + res.statusCode + ': ' + url));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timeout);
        const buffer = Buffer.concat(chunks);
        const ext = path.extname(url).toLowerCase().slice(1) || 'jpg';
        const mimeType = ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        resolve('data:' + mimeType + ';base64,' + buffer.toString('base64'));
      });
    }).on('error', e => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

// 主流程
async function main() {
  console.log('\n📚 离线阅读记录生成器 (' + YEAR + '年)\n');
  console.log('═'.repeat(40));

  // 1. 下载 Chart.js
  console.log('\n1. 下载 Chart.js ...');
  let chartJs;
  try {
    const chartData = await downloadAndEncode('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js');
    chartJs = Buffer.from(chartData.split(',')[1], 'base64').toString('utf8');
    console.log('   ✓ Chart.js 已转换 (' + (chartJs.length / 1024).toFixed(0) + 'KB)');
  } catch (e) {
    console.error('   ✗ Chart.js 下载失败:', e.message);
    process.exit(1);
  }

  // 2. 从 {year}_reading_tracker.html 读取书籍数据
  console.log('\n2. 读取 ' + YEAR + ' 年书籍数据 ...');
  const htmlPath = YEAR + '_reading_tracker.html';
  if (!fs.existsSync(htmlPath)) {
    console.error('   ✗ 文件不存在: ' + htmlPath);
    process.exit(1);
  }

  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // 从 const books = [...] 提取书籍数据
  const booksMatch = htmlContent.match(/const books = (\[[\s\S]+?\]);/);
  if (!booksMatch) {
    console.error('   ✗ 无法从 HTML 中提取书籍数据');
    process.exit(1);
  }

  const booksData = eval('(' + booksMatch[1] + ')');
  console.log('   找到 ' + booksData.length + ' 本书');

  // 3. 收集并下载封面图片
  console.log('\n3. 下载封面图片 ...');
  const coverUrls = [...new Set(booksData.map(b => b.cover).filter(Boolean))];
  console.log('   共 ' + coverUrls.length + ' 张封面（去重后）');

  const coverMap = {};
  let done = 0;
  for (const url of coverUrls) {
    try {
      coverMap[url] = await downloadAndEncode(url);
      done++;
      process.stdout.write('   进度: ' + done + '/' + coverUrls.length + '\r');
    } catch (e) {
      console.error('\n   ✗ 下载失败: ' + url);
      coverMap[url] = null;
      done++;
    }
  }
  console.log('\n   ✓ 封面下载完成 (' + done + '/' + coverUrls.length + ')');

  // 4. 处理 HTML - 替换 Chart.js CDN 为内联
  console.log('\n4. 生成离线 HTML ...');
  let output = htmlContent;
  output = output.replace(
    /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/Chart\.js\/[^"]+"><\/script>/,
    '<script>' + chartJs + '</script>'
  );

  // 5. 移除 Google Fonts
  output = output.replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/, '');

  // 6. 替换封面 URL 为 base64
  let booksJsonStr = JSON.stringify(booksData, null, 2);
  for (const [url, base64] of Object.entries(coverMap)) {
    if (base64) {
      booksJsonStr = booksJsonStr.replaceAll('"' + url + '"', '"' + base64 + '"');
    }
  }
  output = output.replace(/const books = \[[\s\S]+?\];/, 'const books = ' + booksJsonStr + ';');

  // 7. 输出文件
  const outputPath = YEAR + '_reading_tracker_offline.html';
  fs.writeFileSync(outputPath, output);
  const sizeMB = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);
  console.log('   ✓ 已生成 ' + outputPath + ' (' + sizeMB + 'MB)');

  console.log('\n✅ 完成!');
  console.log('\n下一步:');
  console.log('   用浏览器打开 ' + outputPath + ' 验证');
  console.log('   断开网络后刷新页面确认离线正常');
}

main().catch(e => {
  console.error('\n✗ 错误:', e.message);
  process.exit(1);
});
