const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const generatorFiles = ['reading-tracker-github.js', 'reading-tracker-year-github.js'];

function load(file) {
  let source = fs.readFileSync(file, 'utf8');
  let end;
  if (file === 'template.js') {
    source = source.match(/const template = `([\s\S]*)`;/)[1];
    end = source.indexOf('// 书籍数据（由生成脚本注入）');
  }
  const start = source.indexOf('const COUNTRY_PREFIX_MAP');
  if (end === undefined) end = source.indexOf('\n\nfunction processBooks', start);
  return vm.runInNewContext(source.slice(start, end) + '\n({ deriveCountry, deriveCountryInfo })');
}

const CASES = [
  // 任意括号样式 + 简称表
  ['【韩】崔宰勋', '王宁', '韩国'],
  ['［美］B.J.福格（BJ Fogg,PhD）, B.J.福格', '徐毅', '美国'],
  ['(波兰)切斯瓦夫·米沃什', '乌兰', '波兰'],
  ['[俄罗斯] 瓦西里·格罗斯曼', '力冈', '俄罗斯'],
  ['[丹] 克尔凯郭尔', '京不特', '丹麦'],
  ['[徳] 弗里德里希·尼采', '钱春绮', '德国'],
  ['(清)纪昀', '', '中国'],
  ['（清）沈复', '', '中国'],
  ['[中]The Type', '', '中国'],
  // 不在表里的括号文字直接当国名
  ['[巴西] 保罗·柯艾略', '丁文林', '巴西'],
  ['[荷兰] 高罗佩', '陈来元', '荷兰'],
  // 旧前缀不受影响
  ['[日]东野圭吾', '', '日本'],
  ['〔英〕乔治·奥威尔', '', '英国'],
  ['[南非] 苏珊·纽曼', '', '南非'],
  // 无前缀中文名
  ['王小波', '', '中国'],
  ['苏珊.桑塔格', '程巍', '未标注'],
  ['罗伯特・麦基', '', '未标注'],
  ['理查．霍夫士達特（Richard Hofstadter）', '', '未标注'],
  ['康德', '邓晓芒, 杨祖陶 [校]', '未标注'],
  ['西澤保彦', '王靜怡', '未标注'],
  // 无前缀外文名不再默认美国
  ['James Clear', '', '未标注'],
  ['Viktor E. Frankl', '', '未标注'],
];

for (const file of [...generatorFiles, 'template.js']) {
  test('国别兜底规则：' + file, () => {
    const { deriveCountry } = load(file);
    for (const [author, translator, expected] of CASES) {
      assert.equal(deriveCountry(author, translator), expected, file + ': ' + author);
    }
  });
}

test('括号文字不在简称表时 reason 为 bracket，便于构建提醒', () => {
  const { deriveCountryInfo } = load(generatorFiles[0]);
  assert.equal(deriveCountryInfo('[巴西] 保罗·柯艾略').reason, 'bracket');
  assert.equal(deriveCountryInfo('[丹] 克尔凯郭尔').reason, 'prefix');
});

test('processBooks 透传 Translator 供国别判断', () => {
  for (const file of generatorFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const start = source.indexOf('const COUNTRY_PREFIX_MAP');
    const end = source.indexOf('\n\nfunction addDerived', start);
    const { processBooks } = vm.runInNewContext(source.slice(start, end) + '\n({ processBooks })', { console });
    const [b] = processBooks([{ id: 'rec1', fields: { Title: 'x', Author: '康德', Translator: '邓晓芒' } }]);
    assert.equal(b.translator, '邓晓芒', file);
  }
});
