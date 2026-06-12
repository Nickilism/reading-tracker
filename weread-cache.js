/**
 * weread-cache.js - 微信读书数据增量缓存
 *
 * 缓存文件: weread-cache.json（项目根目录）
 * 缓存 key: wereadId
 */

const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'weread-cache.json');

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('读取缓存失败，将重新获取:', e.message);
  }
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function getCached(cache, wereadId) {
  return cache[wereadId] || null;
}

function isCached(cache, wereadId) {
  return !!cache[wereadId];
}

module.exports = { loadCache, saveCache, getCached, isCached };
