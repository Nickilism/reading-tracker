#!/usr/bin/env node
/**
 * preview.js - 阅读记录本地预览服务器
 *
 * 用途：在项目文件夹里双击 preview.cmd，即可启动本机预览并自动打开浏览器。
 *
 * 为什么需要它：直接双击 index.html 会被浏览器拦截（file:// 协议禁止页面读取
 * 其他本地文件，归档页需要 fetch 加载 reading archive/ 下的年度页），
 * 所以用一个临时静态服务器来预览，效果与线上 GitHub Pages 一致。
 *
 * 用法：
 *   node preview.js            # 启动并自动打开浏览器
 *   node preview.js --no-open  # 只启动服务器，不打开浏览器
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { exec } = require('child_process');

const ROOT = __dirname; // 以本脚本所在目录为站点根目录
const HOST = '127.0.0.1'; // 仅本机可访问
const PREFERRED_PORT = 8765;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// 优先用 8765，被占用时让系统分配一个空闲端口
async function findFreePort() {
  for (const port of [PREFERRED_PORT, 0]) {
    try {
      return await new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.once('error', reject);
        srv.listen(port, HOST, () => {
          const p = srv.address().port;
          srv.close(() => resolve(p));
        });
      });
    } catch (e) { /* 尝试下一个 */ }
  }
  throw new Error('没有可用端口');
}

function serveFile(res, filePath) {
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  const rs = fs.createReadStream(filePath);
  rs.on('error', () => { res.destroy(); });
  rs.pipe(res);
}

function notFound(res, pathname) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('找不到文件: ' + pathname);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://' + HOST).pathname);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('请求地址格式错误');
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  const filePath = path.normalize(path.join(ROOT, pathname));
  // 防止越出项目目录的路径穿越
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('禁止访问');
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      if (!err && st.isDirectory()) {
        const idx = path.join(filePath, 'index.html');
        fs.stat(idx, (e2, st2) => {
          if (e2 || !st2.isFile()) return notFound(res, pathname);
          serveFile(res, idx);
        });
        return;
      }
      return notFound(res, pathname);
    }
    serveFile(res, filePath);
  });
});

async function main() {
  const noOpen = process.argv.includes('--no-open');
  const port = await findFreePort();
  const url = 'http://' + HOST + ':' + port + '/';

  server.listen(port, HOST, () => {
    console.log('');
    console.log('  📚 阅读记录本地预览已启动');
    console.log('  地址: ' + url);
    console.log('  关闭此窗口即可停止预览。');
    console.log('');
    if (noOpen) {
      console.log('  (--no-open：未自动打开浏览器)');
      return;
    }
    exec('start "" "' + url + '"', (err) => {
      if (err) console.log('  未能自动打开浏览器，请手动访问上面的地址');
    });
  });
}

main().catch((e) => {
  console.error('启动预览失败: ' + e.message);
  process.exit(1);
});