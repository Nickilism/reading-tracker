/**
 * weread-match.js - Airtable 书籍 ↔ 微信读书书架 模糊匹配
 */

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[\s　]/g, '')
    .replace(/[^\w一-龥]/g, '')
    .trim();
}

function authorMatch(airtableAuthor, wereadAuthor) {
  const a = normalize(airtableAuthor);
  const w = normalize(wereadAuthor);
  if (!a || !w) return false;
  if (a.includes(w) || w.includes(a)) return true;
  const aChinese = a.match(/[一-龥]{2,4}/g) || [];
  const wChinese = w.match(/[一-龥]{2,4}/g) || [];
  if (aChinese.some(cn => w.includes(cn))) return true;
  const aWords = a.match(/[a-z]+/g) || [];
  const wWords = w.match(/[a-z]+/g) || [];
  if (aWords.some(word => wWords.includes(word) && word.length > 2)) return true;
  return false;
}

function matchBooks(airtableBooks, shelfBooks) {
  const matched = [];
  const unmatched = [];
  const usedShelfIds = new Set();

  for (const book of airtableBooks) {
    const titleNorm = normalize(book.title);
    let bestMatch = null;

    for (const shelf of shelfBooks) {
      if (usedShelfIds.has(shelf.bookId)) continue;

      const shelfTitleNorm = normalize(shelf.title || '');
      const titleExact = titleNorm === shelfTitleNorm;
      const titleFuzzy = titleNorm.includes(shelfTitleNorm) || shelfTitleNorm.includes(titleNorm);

      if ((titleExact || titleFuzzy) && authorMatch(book.author, shelf.author || '')) {
        bestMatch = shelf;
        if (titleExact) break;
      }
    }

    if (bestMatch) {
      usedShelfIds.add(bestMatch.bookId);
      matched.push({ airtable: book, shelf: bestMatch });
    } else {
      unmatched.push(book);
    }
  }

  return { matched, unmatched };
}

module.exports = { matchBooks, normalize, authorMatch };
