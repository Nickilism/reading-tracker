/**
 * reading-tracker-year-github.js - 交互式阅读记录生成器
 *
 * 环境要求:
 *   - Node.js 14+
 *
 * 依赖文件:
 *   - template.js (必须，与本脚本同目录)
 *
 * 运行方式:
 *   node reading-tracker-year-github.js
 *   运行后输入年份，直接回车使用当前年份
 *
 * 环境变量:
 *   AIRTABLE_API_KEY - Airtable API Key（必须）
 *
 * 功能说明:
 *   交互式输入年份，从 Airtable 获取该年阅读数据，生成 {年份}_reading_tracker.html 文件
 *
 * 输出文件:
 *   {年份}_reading_tracker.html (如 2026_reading_tracker.html)
 */

const https = require('https');
const fs = require('fs');
const readline = require('readline');
process.env.DOTENV_CONFIG_QUIET = 'true';
require('dotenv').config({ debug: false });

// API Key 从环境变量读取
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
if (!AIRTABLE_API_KEY) {
  console.error('错误: 请设置 AIRTABLE_API_KEY 环境变量');
  process.exit(1);
}

// Load template: read file as raw string, extract template literal content
const templateContent = fs.readFileSync('./template.js', 'utf8');
const TEMPLATE = templateContent.match(/const template = `([\s\S]*)`;/)[1];
const BASE_ID = 'appJJmTgbDFTEnJxz';
const TABLE_NAME = 'Books';

const COUNTRY_PREFIX_MAP = {
  '[日]': '日本', '[美]': '美国', '[德]': '德国', '[英]': '英国',
  '[法]': '法国', '[塞尔维亚]': '塞尔维亚', '[韩]': '韩国', '[俄]': '俄罗斯',
  '[以色列]': '以色列', '[爱尔兰]': '爱尔兰', '[英美]': '英美', '[荷]': '荷兰',
  '[意大利]': '意大利', '[奥]': '奥地利', '[奥地利]': '奥地利', '[阿根廷]': '阿根廷',
  '[波兰]': '波兰', '[葡萄牙]': '葡萄牙', '[古希腊]': '古希腊',
  '[瑞典]': '瑞典', '[加拿大]': '加拿大', '[澳]': '澳大利亚',
  '[英国]': '英国', '[加]': '加拿大', '[意]': '意大利', '[波]': '波兰',
  '[阿]': '阿根廷', '[捷克]': '捷克', '[西]': '西班牙',
  '(日)': '日本', '(美)': '美国', '(德)': '德国', '(英)': '英国',
  '(法)': '法国', '(韩)': '韩国', '(俄)': '俄罗斯', '(荷)': '荷兰',
  '(意)': '意大利', '(奥)': '奥地利', '(葡萄牙)': '葡萄牙',
  '(古希腊)': '古希腊', '(俄罗斯)': '俄罗斯',
  '（日）': '日本', '（美）': '美国', '（德）': '德国', '（英）': '英国',
  '（法）': '法国', '（韩）': '韩国', '（俄）': '俄罗斯',
  '（意）': '意大利', '（葡萄牙）': '葡萄牙',
  '〔美〕': '美国', '〔英〕': '英国', '〔日〕': '日本', '〔德〕': '德国',
  '〔法〕': '法国', '〔俄〕': '俄罗斯', '〔意〕': '意大利', '〔波〕': '波兰',
};


function deriveCountry(author) {
  for (const [prefix, country] of Object.entries(COUNTRY_PREFIX_MAP)) {
    if (author.includes(prefix)) return country;
  }
  const nameOnly = author.replace(/[\[\(（【】『』""''【】《》<>]+/g, '').trim();
  if (/[\u4e00-\u9fa5]/.test(nameOnly)) return '中国';
  return '美国';
}

function processBooks(records) {
  return records.map(r => {
    const b = r.fields || r;
    const start = b['Start Time'] ? new Date(b['Start Time']).toISOString().split('T')[0] : '';
    const finish = b['Finish Time'] ? new Date(b['Finish Time']).toISOString().split('T')[0] : '';
    const rating = b['My Rating'];
    return {
      title: b.Title || '',
      author: b.Author || '',
      start,
      finish,
      rating: rating !== undefined && rating !== null ? rating : '',
      pages: b.Pages || '',
      doubanLink: b['Douban Link'] || '',
      cover: b['Douban Cover Link'] || '',
      review: b.Review || ''
    };
  });
}

function addDerived(books) {
  books.forEach(b => {
    b.month = b.finish ? new Date(b.finish + 'T00:00:00').getMonth() + 1 : 0;
    b.country = deriveCountry(b.author);
  });
  return books;
}

function generate(year, books) {
  const countryMapStr = JSON.stringify(COUNTRY_PREFIX_MAP).replace(/"/g, "'");
  let output = TEMPLATE
    .replace(/\{\{YEAR\}\}/g, String(year))
    .replace(/\{\{GENERATED_DATE\}\}/g, new Date().toISOString().split('T')[0])
    .replace('{{COUNTRY_PREFIX_MAP}}', countryMapStr)
    .replace('{{BOOKS_JSON}}', JSON.stringify(books));
  return output;
}

function airtableRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.airtable.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + AIRTABLE_API_KEY,
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse response: ' + data)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchAirtableRecords(year) {
  const allRecords = [];
  let offset = null;
  do {
    const params = new URLSearchParams({
      'filterByFormula': 'YEAR({Finish Time})=' + year,
      'sort[0][field]': 'Finish Time',
      'sort[0][direction]': 'asc',
      'maxRecords': '100'
    });
    if (offset) { params.append('offset', offset); }
    const url = '/v0/' + BASE_ID + '/' + encodeURIComponent(TABLE_NAME) + '?' + params.toString();
    const response = await airtableRequest(url);
    if (response.records) { allRecords.push(...response.records); }
    offset = response.offset;
    await new Promise(r => setTimeout(r, 250));
  } while (offset);
  return allRecords;
}

async function generateForYear(year) {
  if (!/^\d{4}$/.test(year)) {
    console.log('年份格式错误，请输入4位数字年份');
    return;
  }

  const outputFilename = year + '_reading_tracker.html';

  console.log('\n正在从 Airtable 获取 ' + year + ' 年的数据...');
  try {
    const records = await fetchAirtableRecords(year);
    if (!records || records.length === 0) {
      console.log('未找到 ' + year + ' 年的数据');
      return;
    }
    console.log('获取到 ' + records.length + ' 条记录');
    const processed = addDerived(processBooks(records));
    const html = generate(year, processed);
    fs.writeFileSync(outputFilename, html);
    console.log('\n已生成 ' + outputFilename);
    const cc = {};
    processed.forEach(b => { cc[b.country] = (cc[b.country] || 0) + 1; });
    console.log('\n国别分布:');
    Object.entries(cc).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log('  ' + c + ': ' + n));
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
      try {
        new Function(scriptMatch[1]);
        console.log('\nJS 语法验证: OK');
      } catch (e) {
        console.log('\nJS 语法错误:', e.message);
      }
    }
  } catch (error) {
    console.error('获取数据失败:', error.message);
  }
}

async function main() {
  const currentYear = String(new Date().getFullYear());
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('请输入年份（直接回车使用当前年份 ' + currentYear + '）: ', async (year) => {
    rl.close();
    const inputYear = year.trim() || currentYear;
    await generateForYear(inputYear);
  });
}

main().catch(console.error);
