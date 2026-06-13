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
    const candidates = [];

    for (const shelf of shelfBooks) {
      if (usedShelfIds.has(shelf.bookId)) continue;

      const shelfTitleNorm = normalize(shelf.title || '');
      const titleExact = titleNorm === shelfTitleNorm;
      const titleFuzzy = titleNorm.includes(shelfTitleNorm) || shelfTitleNorm.includes(titleNorm);

      if (!titleExact && !titleFuzzy) continue;

      const shelfAuthor = shelf.author || '';
      const hasAuthorMatch = shelfAuthor && authorMatch(book.author, shelfAuthor);
      // PDF 导入的书 author 常为空，此时仅靠 title 匹配
      if (!shelfAuthor || hasAuthorMatch) {
        candidates.push({
          shelf,
          titleExact,
          hasAuthorMatch,
          noteCount: (shelf.noteCount || 0) + (shelf.bookmarkCount || 0)
        });
      }
    }

    // 选择最佳候选：有笔记 > title exact > author 匹配 > 笔记数量多
    // 同一本书在微信读书可能有多个版本（epub 官版 + PDF 导入版），
    // 优先选有笔记的版本（通常是用户实际阅读的版本）
    let bestMatch = null;
    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        // 1. 有笔记的优先（epub 无笔记 vs PDF 有笔记）
        const aHasNotes = a.noteCount > 0;
        const bHasNotes = b.noteCount > 0;
        if (aHasNotes !== bHasNotes) return bHasNotes - aHasNotes;
        // 2. title exact match 优先
        if (a.titleExact !== b.titleExact) return b.titleExact - a.titleExact;
        // 3. author 匹配优先（PDF 导入的书 author 可能为空）
        if (a.hasAuthorMatch !== b.hasAuthorMatch) return b.hasAuthorMatch - a.hasAuthorMatch;
        // 4. 笔记数量多的优先
        return b.noteCount - a.noteCount;
      });
      bestMatch = candidates[0].shelf;
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
