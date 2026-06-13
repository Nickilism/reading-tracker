/**
 * reading-tracker-github.js - GitHub Actions 版本阅读记录生成器
 *
 * 环境要求:
 *   - Node.js 14+
 *
 * 依赖文件:
 *   - template.js (必须，与本脚本同目录)
 *
 * 运行方式:
 *   node reading-tracker-github.js [年份]
 *   年份参数可选，默认当前年份
 *
 * 环境变量:
 *   AIRTABLE_API_KEY - Airtable API Key（必须）
 *
 * 功能说明:
 *   从 Airtable 获取该年阅读数据，生成 {年份}_reading_tracker.html 文件
 *   用于 GitHub Actions 自动部署
 *
 * 输出文件:
 *   {年份}_reading_tracker.html (如 2026_reading_tracker.html)
 */

const https = require('https');
const fs = require('fs');
process.env.DOTENV_CONFIG_QUIET = 'true';
require('dotenv').config({ debug: false });
const { fetchShelf, fetchBookInfo, fetchHighlights, fetchThoughts, fetchPopularHighlights, fetchNotebooks, searchBooks, sleep } = require('./weread-api');
const { matchBooks, normalize } = require('./weread-match');
const { loadCache, saveCache, isCached } = require('./weread-cache');

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
      review: b.Review || '',
      summary: b.Summary || ''
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

async function fetchWeReadData(books, noCache) {
  if (!process.env.WEAREAD_API_KEY && !process.env.WEREAD_API_KEY) {
    console.log('\n未设置 WEREAD_API_KEY，跳过微信读书数据获取');
    return {};
  }

  console.log('\n正在获取微信读书数据...');
  const cache = noCache ? {} : loadCache();
  const cacheHits = [];
  const toFetch = [];

  // 1. 从书架匹配
  let shelfBooks;
  try {
    shelfBooks = await fetchShelf();
    console.log('  书架获取成功，共 ' + shelfBooks.length + ' 本');
  } catch (e) {
    console.error('  获取书架失败:', e.message);
    return {};
  }

  let { matched, unmatched } = matchBooks(books, shelfBooks);
  console.log('  书架匹配: ' + matched.length + ' 本');

  // 2. 对未匹配的书，从笔记本概览中再次匹配（覆盖已从书架删除的书）
  if (unmatched.length > 0) {
    try {
      const notebooks = await fetchNotebooks();
      console.log('  笔记本概览获取成功，共 ' + notebooks.length + ' 本有笔记');
      const notebookShelf = notebooks.map(nb => ({
        bookId: nb.bookId,
        title: (nb.book && nb.book.title) || '',
        author: (nb.book && nb.book.author) || '',
        inStoreBookId: (nb.book && nb.book.inStoreBookId) || ''
      }));
      // 为 matched 的书补充 inStoreBookId 和 noteCount，
      // 并在有更好版本时替换（书架匹配时没有 noteCount 信息）
      const storeIdMap = {};
      const noteCountMap = {};
      notebooks.forEach(nb => {
        if (nb.book) {
          if (nb.book.inStoreBookId) {
            storeIdMap[nb.bookId] = nb.book.inStoreBookId;
          }
          noteCountMap[nb.bookId] = (nb.noteCount || 0) + (nb.bookmarkCount || 0);
        }
      });
      // 建立 title → notebooks 条目索引，用于查找同名导入版
      const titleNotebookMap = {};
      notebooks.forEach(nb => {
        if (nb.book && nb.noteCount > 0) {
          const norm = normalize(nb.book.title || '');
          if (norm && !titleNotebookMap[norm]) {
            titleNotebookMap[norm] = nb;
          }
        }
      });
      matched.forEach(m => {
        // 补充 inStoreBookId
        if (!m.shelf.inStoreBookId && storeIdMap[m.shelf.bookId]) {
          m.shelf.inStoreBookId = storeIdMap[m.shelf.bookId];
        }
        // 补充 noteCount
        if (m.shelf.noteCount === undefined) {
          m.shelf.noteCount = noteCountMap[m.shelf.bookId] || 0;
        }
        // 如果当前版本没有笔记，检查是否有同名导入版有笔记
        if (m.shelf.noteCount === 0) {
          const norm = normalize(m.airtable.title);
          const better = titleNotebookMap[norm];
          if (better && better.bookId !== m.shelf.bookId) {
            m.shelf = {
              bookId: better.bookId,
              title: (better.book && better.book.title) || '',
              author: (better.book && better.book.author) || '',
              inStoreBookId: (better.book && better.book.inStoreBookId) || '',
              noteCount: (better.noteCount || 0) + (better.bookmarkCount || 0)
            };
          }
        }
      });
      const retry = matchBooks(unmatched, notebookShelf);
      matched = matched.concat(retry.matched);
      unmatched = retry.unmatched;
      console.log('  笔记本补充匹配: ' + retry.matched.length + ' 本');
    } catch (e) {
      console.error('  获取笔记本概览失败:', e.message);
    }
  }

  if (unmatched.length > 0) {
    console.log('  最终未匹配: ' + unmatched.length + ' 本 (' + unmatched.map(b => b.title).join(', ') + ')');
  }

  // 3. 分流：缓存 vs 需要获取
  const wereadData = {};
  for (const { airtable, shelf } of matched) {
    airtable.wereadId = shelf.bookId;
    const cached = cache[shelf.bookId];
    // 缓存命中条件：有数据且有 chapters（旧缓存可能缺少 chapters）
    if (!noCache && cached && cached.chapters) {
      wereadData[shelf.bookId] = cached;
      cacheHits.push(airtable.title);
    } else {
      toFetch.push({ airtable, shelf });
    }
  }

  // 为缓存数据重建 _order（旧缓存可能没有 chapters 或 _order）
  let cacheRebuilt = false;
  for (const bookId of Object.keys(wereadData)) {
    const book = wereadData[bookId];
    if (book.highlights && book.highlights.length > 0 && book.highlights[0]._order === undefined) {
      cacheRebuilt = true;
      // 章节名 → 顺序 映射
      const nameOrder = {};
      if (book.chapters && book.chapters.length > 0) {
        const len = book.chapters.length;
        book.chapters.forEach((ch, idx) => {
          nameOrder[ch.title] = len - 1 - idx;
        });
      }
      const getOrder = (chName) => nameOrder[chName] !== undefined ? nameOrder[chName] : 9999;
      book.highlights.forEach(h => { h._order = getOrder(h.chapter); });
      book.highlights.sort((a, b) => a._order - b._order);
      if (book.thoughts) {
        book.thoughts.forEach(t => { t._order = getOrder(t.chapter); });
        book.thoughts.sort((a, b) => a._order - b._order);
      }
      if (book.popularHighlights) {
        book.popularHighlights.forEach(p => { p._order = getOrder(p.chapter); });
        book.popularHighlights.sort((a, b) => a._order - b._order);
      }
    }
  }

  if (cacheHits.length > 0) {
    console.log('  缓存命中: ' + cacheHits.length + ' 本');
  }

  if (toFetch.length > 0) {
    console.log('  需要获取: ' + toFetch.length + ' 本');
  }

  // 4. 逐本获取数据
  for (let i = 0; i < toFetch.length; i++) {
    const { airtable, shelf } = toFetch[i];
    const bookId = shelf.bookId;
    console.log('  [' + (i + 1) + '/' + toFetch.length + '] ' + airtable.title);

    try {
      const [info, highlights, thoughts, popular] = await Promise.all([
        fetchBookInfo(bookId),
        fetchHighlights(bookId),
        fetchThoughts(bookId),
        fetchPopularHighlights(bookId)
      ]);

      const chapterMap = {};
      const chapterOrder = {};  // chapterUid → 章节顺序索引
      const chapters = highlights.chapters || [];
      // 用 chapterIdx（章节在书中的真实位置）排序
      chapters.forEach(ch => {
        chapterMap[ch.chapterUid] = ch.title;
        chapterOrder[ch.chapterUid] = ch.chapterIdx !== undefined ? ch.chapterIdx : 0;
      });

      // 按章节顺序排序的比较函数
      const byChapter = (a, b) => {
        const oa = a._order !== undefined ? a._order : 9999;
        const ob = b._order !== undefined ? b._order : 9999;
        return oa - ob;
      };

      const hlList = (highlights.updated || []).map(h => ({
        text: h.markText || '',
        chapter: chapterMap[h.chapterUid] || '',
        color: h.colorStyle || 0,
        _order: chapterOrder[h.chapterUid] !== undefined ? chapterOrder[h.chapterUid] : 9999
      })).sort(byChapter);

      // 章节名 → 顺序索引映射（用于想法和热门划线排序）
      const chapterNameOrder = {};
      Object.entries(chapterMap).forEach(([uid, title]) => {
        chapterNameOrder[title] = chapterOrder[uid];
      });

      const thList = (thoughts.reviews || [])
        .filter(r => (r.review && r.review.type) !== 4)  // 排除全书点评（type=4）
        .map(r => {
          const rev = r.review || {};
          return {
            text: rev.content || '',
            quote: rev.abstract || '',
            chapter: rev.chapterName || '',
            _order: chapterNameOrder[rev.chapterName] !== undefined ? chapterNameOrder[rev.chapterName] : 9999
          };
        })
        .filter(t => t.text)
        .sort(byChapter);

      const popChapters = {};
      // 合并 highlights 和 popular 的章节，popular 覆盖更全
      const allNameOrder = Object.assign({}, chapterNameOrder);
      (popular.chapters || []).forEach(ch => {
        popChapters[ch.chapterUid] = ch.title;
        // 用 chapterIdx 补全 highlights 中没有的章节
        if (allNameOrder[ch.title] === undefined && ch.chapterIdx !== undefined) {
          allNameOrder[ch.title] = ch.chapterIdx;
        }
      });
      let popList = (popular.items || []).map(item => {
        const chName = popChapters[item.chapterUid] || '';
        return {
          text: item.markText || '',
          count: item.totalCount || 0,
          chapter: chName,
          _order: allNameOrder[chName] !== undefined ? allNameOrder[chName] : 9999
        };
      }).sort(byChapter);

      // 5. 导入书籍：从官方版本获取热门划线和评分
      //    划线/想法从匹配版本获取（通常是 PDF 导入版，有用户笔记），
      //    热门划线和推荐值从官方版本获取（导入版通常没有这些数据）
      let finalRating = info.newRating || 0;
      let finalRatingCount = info.newRatingCount || 0;
      const officialBookId = shelf.inStoreBookId;
      if (officialBookId && officialBookId !== String(bookId)) {
        try {
          const [officialPopular, officialInfo] = await Promise.all([
            fetchPopularHighlights(officialBookId),
            fetchBookInfo(officialBookId)
          ]);
          // 热门划线
          const offChapters = {};
          (officialPopular.chapters || []).forEach(ch => {
            offChapters[ch.chapterUid] = ch.title;
          });
          const officialPopList = (officialPopular.items || []).map(item => ({
            text: item.markText || '',
            count: item.totalCount || 0,
            chapter: offChapters[item.chapterUid] || ''
          }));
          if (officialPopList.length > 0) {
            popList = officialPopList;
            console.log('    → 从官方版本获取热门划线: ' + popList.length + ' 条');
          }
          // 评分
          if (finalRating === 0 && officialInfo.newRating) {
            finalRating = officialInfo.newRating;
            finalRatingCount = officialInfo.newRatingCount || 0;
            console.log('    → 从官方版本获取评分: ' + finalRating);
          }
          await sleep(200);
        } catch (e) {
          // 获取失败不影响主流程
        }
      }

      wereadData[bookId] = {
        rating: finalRating,
        ratingCount: finalRatingCount,
        chapters: highlights.chapters || [],
        highlights: hlList,
        thoughts: thList,
        popularHighlights: popList
      };

      if (i < toFetch.length - 1) {
        await sleep(300);
      }
    } catch (e) {
      console.error('    获取失败: ' + e.message);
    }
  }

  // 6. 合并写回缓存
  const updatedCache = { ...cache, ...wereadData };
  if ((toFetch.length > 0 || cacheRebuilt) && !noCache) {
    saveCache(updatedCache);
    console.log('  缓存已更新');
  }

  const totalWithData = Object.keys(wereadData).length;
  console.log('微信读书数据获取完成: ' + totalWithData + ' 本书有笔记数据');

  return wereadData;
}

function generate(year, books, wereadData) {
  const countryMapStr = JSON.stringify(COUNTRY_PREFIX_MAP).replace(/"/g, "'");
  let output = TEMPLATE
    .replace(/\{\{YEAR\}\}/g, String(year))
    .replace(/\{\{GENERATED_DATE\}\}/g, new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }))
    .replace('{{COUNTRY_PREFIX_MAP}}', countryMapStr)
    .replace('{{BOOKS_JSON}}', JSON.stringify(books))
    .replace('{{WEREAD_JSON}}', JSON.stringify(wereadData));
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

async function main() {
  const noCache = process.argv.includes('--no-cache');

  // 支持命令行参数指定年份，默认当前年份（跳过 --no-cache 标志）
  const yearArg = process.argv.slice(2).find(a => /^\d{4}$/.test(a));
  const year = yearArg || String(new Date().getFullYear());

  if (!/^\d{4}$/.test(year)) {
    console.log('年份格式错误，请输入4位数字年份');
    process.exit(1);
  }

  const outputFilename = year + '_reading_tracker.html';

  console.log('\n正在从 Airtable 获取 ' + year + ' 年的数据...');
  try {
    const records = await fetchAirtableRecords(year);
    if (!records || records.length === 0) {
      console.log('未找到 ' + year + ' 年的数据');
      process.exit(1);
    }
    console.log('获取到 ' + records.length + ' 条记录');
    const processed = addDerived(processBooks(records));
    const wereadData = await fetchWeReadData(processed, noCache);
    const html = generate(year, processed, wereadData);
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
    process.exit(1);
  }
}

main().catch(console.error);
