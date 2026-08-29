const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const generatorFiles = [
  'reading-tracker-github.js',
  'reading-tracker-year-github.js'
];

function loadCountryDerivation(file) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('const COUNTRY_PREFIX_MAP');
  const end = source.indexOf('\n\nfunction processBooks', start);
  return vm.runInNewContext(
    source.slice(start, end) + '\n({ COUNTRY_PREFIX_MAP, deriveCountry })'
  );
}

test('国别映射应识别《两种孤独》的哥伦比亚和秘鲁作者', () => {
  const authors = [
    '[哥伦比亚]加夫列尔·加西亚·马尔克斯',
    '[秘鲁] 马里奥·巴尔加斯·略萨',
    '[哥伦比亚] 加西亚·马尔克斯'
  ];

  for (const file of generatorFiles) {
    const { COUNTRY_PREFIX_MAP, deriveCountry } = loadCountryDerivation(file);
    assert.equal(COUNTRY_PREFIX_MAP['[哥伦比亚]'], '哥伦比亚', file);
    assert.equal(COUNTRY_PREFIX_MAP['[秘鲁]'], '秘鲁', file);
    assert.deepEqual(
      authors.map(deriveCountry),
      ['哥伦比亚', '秘鲁', '哥伦比亚'],
      file
    );
  }
});
