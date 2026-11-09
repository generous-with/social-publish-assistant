const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parse } = require('../parser.js');
const source = fs.readFileSync(require.resolve('../xhs-fill.js'), 'utf8');

function editorFixture({ target = 'video', body = '', recommendations = {}, rejected = [] } = {}) {
  const queries = [];
  const chosen = [];
  let time = 0;
  let pending = '';
  let selected = '';
  let offset = 0;
  const textNode = { get data() { return editor.textContent; } };
  const title = { value: '', dispatchEvent() {} };
  const visible = node => Object.assign(node, { getClientRects: () => [1] });
  const editor = visible({
    textContent: body,
    get innerText() { return target === 'article' ? this.textContent.replace(/\n/g, '\n\n') : this.textContent; },
    querySelectorAll() { return []; },
    focus() {},
    dispatchEvent() {},
    getAttribute() { return null; },
  });
  const topicList = visible({
    querySelectorAll() {
      return (recommendations[pending] || []).map(name => {
        const label = { textContent: '#' + name };
        return visible({
          textContent: label.textContent + ' 1万浏览',
          querySelector() { return label; },
          getAttribute() { return null; },
          ownerDocument: { defaultView: { MouseEvent: class {} } },
          dispatchEvent() {},
          click() {
            if (rejected.includes(pending)) return;
            if (target === 'article' && (selection.anchorNode !== textNode || selection.anchorOffset !== textNode.data.length)) return;
            chosen.push(name);
            editor.textContent = editor.textContent.slice(0, -pending.length) + '#' + name + '[话题]# ';
            pending = '';
          },
        });
      });
    },
  });
  const selection = {
    isCollapsed: true,
    anchorNode: null,
    anchorOffset: 0,
    removeAllRanges() {},
    addRange(range) {
      offset = range.offset;
      selected = editor.textContent.slice(offset);
      this.anchorNode = range.start;
      this.anchorOffset = range.offset;
    },
    toString() { return selected; },
  };
  const context = vm.createContext({
    location: new URL('https://creator.xiaohongshu.com/publish/publish?target=' + target),
    URLSearchParams,
    setTimeout(fn, ms) { time += ms; fn(); },
    Date: { now: () => time },
    HTMLInputElement: class { set value(v) { this.value = v; } },
    Event: class {},
    NodeFilter: { SHOW_TEXT: 4 },
    getSelection: () => selection,
    document: {
      querySelectorAll(selector) {
        if (selector.startsWith('input[placeholder')) return [visible(title)];
        if (selector.includes('creator-editor-topic-container')) {
          return selector.includes('.item') ? topicList.querySelectorAll() : [topicList];
        }
        if (selector.startsWith('[contenteditable')) return [editor];
        if (selector.startsWith('.tiptap-container')) return [editor];
        if (selector === '.img-list .flex-list') return [visible({})];
        return [];
      },
      createRange() {
        return {
          offset: 0,
          selectNodeContents() {},
          collapse(toStart) { if (!toStart) this.offset = editor.textContent.length; },
          setStart(node, start) { this.start = node; this.offset = start; },
        };
      },
      createTreeWalker() {
        let next = textNode;
        return { nextNode() { const node = next; next = null; return node; } };
      },
      execCommand(command, _, value) {
        if (command === 'delete') {
          editor.textContent = editor.textContent.slice(0, offset);
          pending = '';
          return true;
        }
        editor.textContent = editor.textContent.slice(0, offset) + value;
        pending = value.match(/#[^#]+$/)?.[0] || '';
        selection.anchorNode = null;
        if (pending) queries.push(pending);
        return true;
      },
    },
  });
  vm.runInContext(source, context);
  const fill = (tags, mode = 'video') => {
    const txt = '【小红书】\n主标题：视频标题\n简介：两行简介\n第二行 ' +
      tags.map(tag => '#' + tag).join(' ');
    return context.fillXhs({ ...parse(txt, '小红书'), original: false }, true, mode);
  };
  return { fill, editor, chosen, queries };
}

test('Xiaohongshu article handles editor paragraph spacing and restores the caret before choosing each topic', async () => {
  const page = editorFixture({ target: 'article', recommendations: { '#AI': ['AI工具', 'AI'], '#教程': ['教程'] } });
  const result = await page.fill(['AI', '教程'], 'article');
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(page.chosen, ['AI工具', '教程']);
  assert.equal(page.editor.textContent.trim(), '两行简介\n第二行 #AI工具[话题]# #教程[话题]#');
});

test('Xiaohongshu appends the first suggestion for each query even when a later row matches exactly', async () => {
  const page = editorFixture({ recommendations: { '#AI': ['AI工具', 'AI'], '#教程': ['教程'] } });
  const result = await page.fill(['AI', '教程']);
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(page.chosen, ['AI工具', '教程']);
  assert.equal(page.editor.textContent.trim(), '两行简介\n第二行 #AI工具[话题]# #教程[话题]#');
});

test('Xiaohongshu retries without punctuation and cleans failed queries before continuing', async () => {
  const page = editorFixture({
    recommendations: { '#开源-工具': ['开源-工具'], '#开源工具': ['开源工具'], '#教程': ['教程'] },
    rejected: ['#开源-工具'],
  });
  const result = await page.fill(['开源-工具', '无结果', '教程']);
  assert.equal(result.ok, false);
  assert.deepEqual(page.queries, ['#开源-工具', '#开源工具', '#无结果', '#教程']);
  assert.deepEqual(page.chosen, ['开源工具', '教程']);
  assert.match(result.message, /开源-工具.*开源工具/);
  assert.match(result.message, /无结果/);
  assert.equal(page.editor.textContent.trim(), '两行简介\n第二行 #开源工具[话题]# #教程[话题]#');
});

test('Xiaohongshu video fill refuses the article entry before writing', async () => {
  const page = editorFixture({ target: 'article', body: '文章草稿' });
  const result = await page.fill(['教程']);
  assert.equal(result.ok, false);
  assert.match(result.message, /视频发布页/);
  assert.equal(page.editor.textContent, '文章草稿');
});

test('The extension opens separate Xiaohongshu panels and dispatches video fill only for the video entry', async () => {
  let open, receive;
  const injected = [];
  const context = vm.createContext({
    URL, importScripts() {}, fillXhs() {}, prepareXhsArticle() {},
    chrome: {
      action: { onClicked: { addListener(fn) { open = fn; } }, async setBadgeText() {}, async setTitle() {} },
      runtime: { onMessage: { addListener(fn) { receive = fn; } } },
      scripting: { async executeScript(options) { injected.push(options); return [{ result: { ok: true } }]; } },
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  const page = 'https://creator.xiaohongshu.com/publish/publish?from=menu&target=';
  for (const target of ['article', 'video']) {
    const url = page + target;
    await open({ id: 1, url });
    const response = await new Promise(resolve => receive({ type: 'social-publish-fill' }, {
      url, tab: { id: 1 },
    }, resolve));
    assert.equal(response.ok, target === 'video');
  }
  assert.equal(injected.length, 3);
  assert.deepEqual(Array.from(injected[0].files), ['markdown-it.min.js', 'parser.js', 'xhs-article-panel.js']);
  assert.deepEqual(Array.from(injected[1].files), ['parser.js', 'panel.js']);
  assert.equal(injected[2].func.name, 'fillXhs');
});

test('Xiaohongshu article dispatch finishes image preparation before filling publish details', async () => {
  let open, receive;
  const injected = [];
  let prepared = false;
  const context = vm.createContext({
    URL, importScripts() {}, fillXhs() {}, prepareXhsArticle() {},
    chrome: {
      action: { onClicked: { addListener(fn) { open = fn; } }, async setBadgeText() {}, async setTitle() {} },
      runtime: { onMessage: { addListener(fn) { receive = fn; } } },
      scripting: { async executeScript(options) {
        injected.push(options);
        if (options.func?.name === 'prepareXhsArticle') {
          return [{ result: { ok: prepared, message: '排版结果', progress: { title: '测试' } } }];
        }
        return [{ result: { ok: true, message: '发布描述已填写' } }];
      } },
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  const page = 'https://creator.xiaohongshu.com/publish/publish?target=';
  const data = { description: '描述', tags: ['话题'], original: true };
  const submit = target => new Promise(resolve => receive({
    type: 'social-publish-fill-xhs-article', data,
  }, { url: page + target, frameId: 0, tab: { id: 1 } }, resolve));
  await open({ id: 1, url: page + 'article' });
  assert.deepEqual(Array.from(injected[0].files), ['markdown-it.min.js', 'parser.js', 'xhs-article-panel.js']);
  assert.equal((await submit('video')).ok, false);
  assert.equal(injected.length, 1);
  assert.equal((await submit('article')).ok, false);
  assert.equal(injected.length, 2);
  prepared = true;
  const result = await submit('article');
  assert.equal(result.ok, true);
  assert.equal(result.progress.title, '测试');
  assert.equal(result.message, '排版结果\n发布描述已填写');
  assert.equal(injected[3].func.name, 'fillXhs');
  assert.equal(injected[3].args[2], 'article');
});

test('Xiaohongshu article returns a concrete message when script injection throws before returning a promise', async () => {
  let receive;
  const context = vm.createContext({
    URL, importScripts() {}, prepareXhsArticle() {},
    chrome: {
      action: { onClicked: { addListener() {} } },
      runtime: { onMessage: { addListener(fn) { receive = fn; } } },
      scripting: { executeScript() { throw Error('无法注入当前标签页'); } },
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  const result = await new Promise(resolve => {
    assert.equal(receive({ type: 'social-publish-fill-xhs-article', data: {} }, {
      url: 'https://creator.xiaohongshu.com/publish/publish?target=article', frameId: 0, tab: { id: 1 },
    }, resolve), true);
  });
  assert.equal(result.ok, false);
  assert.equal(result.message, '无法注入当前标签页');
});
