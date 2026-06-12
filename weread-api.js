/**
 * weread-api.js - 微信读书 API 封装
 */

const https = require('https');

const WEREAD_API_KEY = process.env.WEAREAD_API_KEY || process.env.WEREAD_API_KEY;
const GATEWAY_HOST = 'i.weread.qq.com';
const GATEWAY_PATH = '/api/agent/gateway';
const SKILL_VERSION = '1.0.3';

function gatewayRequest(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ ...body, skill_version: SKILL_VERSION });
    const options = {
      hostname: GATEWAY_HOST,
      port: 443,
      path: GATEWAY_PATH,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + WEREAD_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errcode && json.errcode !== 0) {
            reject(new Error('WeRead API error: ' + (json.errmsg || json.errcode)));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error('Failed to parse WeRead response: ' + data.substring(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchShelf() {
  const result = await gatewayRequest({ api_name: '/shelf/sync' });
  return result.books || [];
}

async function fetchBookInfo(bookId) {
  return await gatewayRequest({ api_name: '/book/info', bookId: bookId });
}

async function fetchHighlights(bookId) {
  return await gatewayRequest({ api_name: '/book/bookmarklist', bookId: bookId });
}

async function fetchThoughts(bookId) {
  return await gatewayRequest({ api_name: '/review/list/mine', bookid: bookId, count: 100 });
}

async function fetchPopularHighlights(bookId) {
  return await gatewayRequest({ api_name: '/book/bestbookmarks', bookId: bookId, chapterUid: 0 });
}

/**
 * 获取所有有笔记的书籍概览（包括已从书架删除的书）
 * 用于扩大匹配范围
 */
async function fetchNotebooks() {
  const allBooks = [];
  let lastSort = 0;
  let hasMore = true;
  while (hasMore) {
    const params = { api_name: '/user/notebooks', count: 100 };
    if (lastSort) params.lastSort = lastSort;
    const result = await gatewayRequest(params);
    if (result.books) allBooks.push(...result.books);
    hasMore = result.hasMore === 1;
    if (hasMore && result.books && result.books.length > 0) {
      lastSort = result.books[result.books.length - 1].sort;
    }
  }
  return allBooks;
}

/**
 * 搜索书城（用于查找导入书籍的官方版本以获取热门划线）
 */
async function searchBooks(keyword) {
  const result = await gatewayRequest({ api_name: '/store/search', keyword: keyword, count: 5, scope: 10 });
  return result.books || [];
}

module.exports = {
  fetchShelf, fetchBookInfo, fetchHighlights, fetchThoughts, fetchPopularHighlights,
  fetchNotebooks, searchBooks, sleep
};
