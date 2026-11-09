const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('../parser');

test('recognizes YouTube headings with alternate case, brackets, spacing and Markdown', () => {
  for (const heading of ['【YOUTUBE 视频】', '[You Tube]', '## **油管影片**', '### YouTube（全中文）', 'YouTube：']) {
    const text = heading + '\n主標題：示例标题\n簡介：示例说明\n[项目地址](https://example.org)\n標籤：AI Agent, 技术教程';
    const data = parse(text, 'YouTube');
    assert.equal(data.title, '示例标题');
    assert.match(data.description, /项目地址/);
    assert.deepEqual(data.tags, ['AI Agent', '技术教程']);
  }
});

test('reports missing and duplicate YouTube sections separately', () => {
  assert.throws(() => parse('【抖音】\n主标题：抖音标题\n简介：抖音说明', 'YouTube'), /没有找到【YouTube】/);
  assert.throws(() => parse('【YouTube】\n标题：甲\n简介：甲\n[You Tube]\n标题：乙\n简介：乙', 'YouTube'), /找到 2 个【YouTube】/);
});
