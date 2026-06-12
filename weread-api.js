/**
 * weread-api.js - 微信读书 API 封装
 */

const https = require('https');

const WEREAD_API_KEY = process.env.WEREAD_API_KEY;
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

module.exports = {
  fetchShelf, fetchBookInfo, fetchHighlights, fetchThoughts, fetchPopularHighlights, sleep
};
