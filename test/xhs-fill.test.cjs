const loadBackground = require('./load-background.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parse } = require('../parser.js');
const source = fs.readFileSync(require.resolve('../xhs-fill.js'), 'utf8');

function editorFixture({ target = 'video', activeTab = '', videoCover = '', body = '', paragraphSpacing = target === 'article',
  requireTopicCaret = target === 'article', rewriteBody = value => value, modelRead = false,
  rerenderTitle = false, recommendations = {}, rejected = [] } = {}) {
  const queries = [];
  const chosen = [];
  let time = 0;
  let pending = '';
  let selected = '';
  let offset = 0;
  const textNode = { get data() { return editor.textContent; } };
  let title = { value: '', dispatchEvent() {} };
  const visible = node => Object.assign(node, { getClientRects: () => [1] });
  const editor = visible({
    textContent: body,
    get innerText() { return paragraphSpacing ? this.textContent.replace(/\n/g, '\n\n') : this.textContent; },
    querySelectorAll() { return []; },
    focus() {},
    dispatchEvent() {},
    getAttribute() { return null; },
  });
  if (modelRead) {
    Object.defineProperty(editor, 'innerText', { get: () => '渲染装饰 ' + editor.textContent });
    editor.pmViewDesc = { dom: editor, node: { content: { size: 10 }, textBetween: () => editor.textContent } };
  }
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
            if (requireTopicCaret && (selection.anchorNode !== textNode || selection.anchorOffset !== textNode.data.length)) return;
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
    location: new URL('https://creator.xiaohongshu.com/publish/publish?' +
      (target === null ? 'source=&published=true' : 'target=' + target)),
    URLSearchParams,
    setTimeout(fn, ms) { time += ms; fn(); },
    Date: { now: () => time },
    HTMLInputElement: class { set value(v) { this.value = v; } },
    Event: class {},
    NodeFilter: { SHOW_TEXT: 4 },
    getSelection: () => selection,
    document: {
      querySelectorAll(selector) {
        if (selector === '.header-tabs .creator-tab.active') {
          return activeTab ? [visible({ textContent: activeTab }), visible({ textContent: activeTab })] : [];
        }
        if (selector === 'button,label,span') return videoCover ? [visible({ textContent: videoCover })] : [];
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
        editor.textContent = editor.textContent.slice(0, offset) + (value.includes('\n') ? rewriteBody(value) : value);
        if (rerenderTitle && value.includes('\n')) title = { value: '平台原来的标题', dispatchEvent() {} };
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
  return { fill, editor, title, chosen, queries };
}

test('Xiaohongshu video can fill a confirmed video tab even without a target parameter', async () => {
  const page = editorFixture({ target: null, activeTab: '上传视频' });
  assert.equal((await page.fill([])).ok, true);
  assert.equal(page.title.value, '视频标题');
  assert.equal(page.editor.textContent.trim(), '两行简介\n第二行');
});

test('Xiaohongshu recognizes video controls when the uploaded video form has no tab header', async () => {
  const page = editorFixture({ target: null, videoCover: 'PK封面' });
  assert.equal((await page.fill([])).ok, true);
  assert.equal(page.title.value, '视频标题');
});

test('a Xiaohongshu URL without a target does not let video fill write into an article or image tab', async () => {
  for (const activeTab of ['写长文', '上传图文', '']) {
    const page = editorFixture({ target: null, activeTab, body: '原文' });
    assert.equal((await page.fill([])).ok, false);
    assert.equal(page.title.value, '');
    assert.equal(page.editor.textContent, '原文');
  }
});

test('Xiaohongshu article handles editor paragraph spacing and restores the caret before choosing each topic', async () => {
  const page = editorFixture({ target: 'article', recommendations: { '#AI': ['AI工具', 'AI'], '#教程': ['教程'] } });
  const result = await page.fill(['AI', '教程'], 'article');
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(page.chosen, ['AI工具', '教程']);
  assert.equal(page.editor.textContent.trim(), '两行简介\n第二行 #AI工具[话题]# #教程[话题]#');
});

test('Xiaohongshu video appends each topic when the editor renders extra paragraph line breaks', async () => {
  const page = editorFixture({ target: null, activeTab: '上传视频', paragraphSpacing: true, requireTopicCaret: true,
    recommendations: { '#AI': ['AI工具', 'AI'], '#教程': ['教程'] } });
  const result = await page.fill(['AI', '教程']);
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(page.chosen, ['AI工具', '教程']);
  assert.equal(page.editor.textContent.trim(), '两行简介\n第二行 #AI工具[话题]# #教程[话题]#');
});

test('Xiaohongshu video does not append topics if the editor loses part of the description', async () => {
  const page = editorFixture({ rewriteBody: value => value.split('\n')[0], recommendations: { '#AI': ['AI工具'] } });
  const result = await page.fill(['AI']);
  assert.equal(result.ok, false);
  assert.match(result.message, /简介.*回读不一致/);
  assert.deepEqual(page.queries, []);
  assert.equal(page.editor.textContent, '两行简介');
});

test('Xiaohongshu video reads the stored ProseMirror text rather than rendered decoration', async () => {
  const page = editorFixture({ modelRead: true, recommendations: { '#AI': ['AI工具'] } });
  const result = await page.fill(['AI']);
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(page.chosen, ['AI工具']);
});

test('Xiaohongshu video checks the current title after the form replaces its input', async () => {
  const page = editorFixture({ rerenderTitle: true, recommendations: { '#AI': ['AI工具'] } });
  const result = await page.fill(['AI']);
  assert.equal(result.ok, false);
  assert.match(result.message, /标题回读不一致/);
  assert.deepEqual(page.queries, []);
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
    URL, fillXhs() {}, prepareXhsArticle() {},
    chrome: {
      action: { onClicked: { addListener(fn) { open = fn; } }, async setBadgeText() {}, async setTitle() {} },
      runtime: { onMessage: { addListener(fn) { receive = fn; } } },
      scripting: { async executeScript(options) { injected.push(options); return [{ result: { ok: true } }]; } },
    },
  });
  loadBackground(context);
  const page = 'https://creator.xiaohongshu.com/publish/publish?from=menu&target=';
  for (const target of ['article', 'video']) {
    const url = page + target;
    await open({ id: 1, url });
    const response = await new Promise(resolve => receive({ type: 'social-publish-fill' }, {
      url, frameId: 0, tab: { id: 1 },
    }, resolve));
    assert.equal(response.ok, target === 'video');
  }
  assert.equal(injected.length, 3);
  assert.deepEqual(Array.from(injected[0].files), ['markdown-it.min.js', 'parser.js', 'xhs-article-panel.js']);
  assert.deepEqual(Array.from(injected[1].files), ['parser.js', 'panel.js']);
  assert.equal(injected[2].func.name, 'fillXhs');
});

test('the reported Xiaohongshu URL opens the video panel only when the page confirms video mode', async () => {
  let open, receive;
  const injected = [];
  let video = true;
  const url = 'https://creator.xiaohongshu.com/publish/publish?source=&published=true';
  loadBackground(vm.createContext({
    URL,
    chrome: {
      action: { onClicked: { addListener(fn) { open = fn; } }, async setBadgeText() {}, async setTitle() {} },
      runtime: { onMessage: { addListener(fn) { receive = fn; } } },
      scripting: { async executeScript(options) {
        injected.push(options);
        return [{ result: { ok: video, message: '结果' } }];
      } },
    },
  }));
  await open({ id: 1, url });
  assert.equal(injected[0]?.func?.name, 'fillXhs');
  assert.equal(injected[0].args[2], 'inspect-video');
  assert.deepEqual(Array.from(injected[1].files), ['parser.js', 'panel.js']);
  const submit = type => new Promise(resolve => receive({ type }, { url, frameId: 0, tab: { id: 1 } }, resolve));
  assert.equal((await submit('social-publish-fill')).ok, true);
  assert.equal(injected[2].func.name, 'fillXhs');
  assert.equal((await submit('social-publish-fill-xhs-article')).ok, false);
  assert.equal(injected.length, 3);
  video = false;
  await open({ id: 1, url });
  assert.equal(injected.length, 4);
  assert.equal(injected[3].args[2], 'inspect-video');
});

test('Xiaohongshu article dispatch finishes image preparation before filling publish details', async () => {
  let open, receive;
  const injected = [];
  let prepared = false;
  const context = vm.createContext({
    URL, fillXhs() {}, prepareXhsArticle() {},
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
  loadBackground(context);
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
    URL, prepareXhsArticle() {},
    chrome: {
      action: { onClicked: { addListener() {} } },
      runtime: { onMessage: { addListener(fn) { receive = fn; } } },
      scripting: { executeScript() { throw Error('无法注入当前标签页'); } },
    },
  });
  loadBackground(context);
  const result = await new Promise(resolve => {
    assert.equal(receive({ type: 'social-publish-fill-xhs-article', data: {} }, {
      url: 'https://creator.xiaohongshu.com/publish/publish?target=article', frameId: 0, tab: { id: 1 },
    }, resolve), true);
  });
  assert.equal(result.ok, false);
  assert.equal(result.message, '无法注入当前标签页');
});
