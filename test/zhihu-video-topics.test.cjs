const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const script = fs.readFileSync(require.resolve('../zhihu-fill.js'), 'utf8');

function fixture(queries) {
  let time = 0, body = '', query = null, list = null, nativeOpened = false, order = [];
  let pendingList;
  const tokens = [];
  const node = (label = '', onClick = () => {}) => ({
    textContent: label, children: [], getClientRects: () => [1], getAttribute: () => null,
    matches: () => false, closest: () => null, contains(other) { return other === this; },
    dispatchEvent(e) { if (e.type === 'click') onClick(); },
    querySelectorAll: () => [], querySelector: () => null,
  });
  const makeList = (tag, entries) => {
    const rows = entries.map(([name, create]) => {
      const row = node('#' + name, () => {
        assert.equal(create, false, 'must never choose the create-topic row');
        assert.equal(query, tag);
        order.push(name);
        tokens.push(node('#' + name));
        body = body.slice(0, -tag.length) + name + ' ';
        nativeOpened = false;
        query = list = null;
      });
      row.querySelector = selector => selector === '.topic-name' ? node('#' + name) :
        selector === '.new-topic' && create ? node('创建新话题') : null;
      return row;
    });
    const root = node();
    root.querySelectorAll = selector => selector === '[role=option]' ? rows : [];
    return root;
  };
  const toolbar = node('', () => {
    order.push('#');
    nativeOpened = true;
    body += (body.endsWith(' ') ? '' : ' ') + '#';
    list = makeList(null, [['默认推荐', false]]);
  });
  toolbar.querySelector = selector => selector === 'svg' ? node() : null;
  const marker = node();
  marker.closest = () => ({ querySelector: () => node('个人观点仅供参考') });
  const area = node();
  area.querySelectorAll = selector => selector.startsWith('.WritePinToolbar') ? [toolbar] : [];
  const title = Object.assign(node(), { tagName: 'TEXTAREA', value: '', matches: () => true });
  const leaf = { get data() { return body; }, get length() { return body.length; } };
  const selection = {
    removeAllRanges() {}, addRange(range) { this.anchorNode = range.start; this.anchorOffset = range.offset; },
    isCollapsed: true,
  };
  const editor = Object.assign(node(), {
    tagName: 'DIV', className: 'public-DraftEditor-content', focus() {},
    closest: () => area, contains: candidate => candidate === leaf,
    querySelectorAll: selector => selector.includes('topic-id') ? tokens : [],
    dispatchEvent(event) { if (event.type === 'paste') body = event.clipboardData.value; },
  });
  Object.defineProperty(editor, 'textContent', { get: () => body });
  class Textarea { set value(value) { Object.defineProperty(this, 'value', { value, writable: true }); } }
  const context = vm.createContext({
    location: new URL('https://www.zhihu.com/upload-video'), window: {}, HTMLTextAreaElement: Textarea,
    Event: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    MouseEvent: class { constructor(type) { this.type = type; } },
    ClipboardEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    DataTransfer: class { setData(_, text) { this.value = text; } }, NodeFilter: { SHOW_TEXT: 4 },
    Date: { now: () => time }, setTimeout(fn, ms) {
      time += ms;
      if (pendingList && time >= pendingList.readyAt) { list = pendingList.rows; pendingList = null; }
      fn();
    },
    getSelection: () => selection,
    document: {
      querySelectorAll(selector) {
        if (selector.includes('videoTypeSelectOverlay')) return [marker];
        if (selector.includes('placeholder*=标题')) return [title];
        if (selector.startsWith('[contenteditable=true]')) return [editor];
        if (selector.includes('.TopicSuggestion-Popover-container')) return list ? [list] : [];
        if (selector.startsWith('button,select,input')) return [node('科技互联网')];
        return [];
      },
      createRange: () => ({
        selectNodeContents() {}, collapse() {},
        setStart(start, offset) { this.start = start; this.offset = offset; },
      }),
      createTreeWalker() { let next = leaf; return { nextNode() { const n = next; next = null; return n; } }; },
      execCommand(command, _, value) {
        assert.equal(command, 'insertText');
        body += value;
        if (nativeOpened && !value.includes('#')) {
          query = value;
          pendingList = { readyAt: time + 350, rows: makeList(query, queries[query] || [[query, true]]) };
        }
        return true;
      },
    },
  });
  vm.runInContext(script, context);
  return { order, fill: tags => context.fillZhihu({ title: '标题', description: '原始简介', tags }, true),
    body: () => body, tokens };
}

test('uses the native topic toolbar and first existing result for each Zhihu video topic', async () => {
  const page = fixture({
    AI工具: [['AI工具', true], ['人工智能工具', false], ['工具', false]],
    技术: [['技术', false], ['技术教程', false]],
  });
  const result = await page.fill(['AI工具', '技术']);
  assert.match(result.message, /话题：2个/, result.message);
  assert.deepEqual(page.order, ['#', '人工智能工具', '#', '技术']);
  assert.deepEqual(page.tokens.map(node => node.textContent), ['#人工智能工具', '#技术']);
  assert.ok(page.body().startsWith('原始简介'));
});

test('does not create a new Zhihu topic when the only candidate is the create row', async () => {
  const page = fixture({});
  const result = await page.fill(['罕见话题']);
  assert.match(result.message, /未找到已有话题/);
  assert.deepEqual(page.order, ['#']);
  assert.equal(page.tokens.length, 0);
  assert.ok(page.body().startsWith('原始简介'));
});
