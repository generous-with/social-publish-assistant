const { test } = require('node:test');
const assert = require('node:assert/strict');
const prepare = require('../article-markdown');
const markdownit = require('../markdown-it.min');
const fs = require('node:fs');
const vm = require('node:vm');

test('extracts the title and removes the author and closing section outside fenced code', () => {
  const source = '# 标题\n\n<p align="right">作者：大书大 | 原创技术干货</p>\n\n**要点**\n\n```md\n## 写在最后\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n## 写在最后\n\n这段跳过';
  const article = prepare(source, markdownit);
  const html = article.sections.join('');
  assert.equal(article.title, '标题');
  assert.match(html, /<strong>要点<\/strong>/);
  assert.match(html, /<table>/);
  assert.match(html, /<code[^>]*>## 写在最后/);
  assert.doesNotMatch(html, /作者|这段跳过|<h1>/);
});

test('three selected pictures get stable insertion points at standalone image markers', () => {
  const source = '# 标题\n\n一\n\n![配图一](a.png)\n\n二\n\n![配图二](b.png)\n\n三\n\n![配图三](c.png)\n\n四';
  assert.deepEqual(prepare(source, markdownit, true).sections.map(html => html.trim()),
    ['<p>一</p>', '<p>二</p>', '<p>三</p>', '<p>四</p>']);
});

test('the first image follows the complete opening quote even with later image markers', () => {
  const source = '# 标题\n\n> 第一段\n>\n> 第二段\n\n正文开头\n\n![第一张](a.png)\n\n正文中段\n\n![第二张](b.png)\n\n正文后段\n\n![第三张](c.png)\n\n收尾';
  const { sections } = prepare(source, markdownit, true);
  assert.equal(sections.length, 4);
  assert.match(sections[0], /^<blockquote>[\s\S]*第二段[\s\S]*<\/blockquote>\s*$/);
  assert.match(sections[1], /^<p>正文开头<\/p>/);
  assert.match(sections[2], /正文后段/);
});

test('raw HTML is escaped and remote images are not loaded by the preview', () => {
  const source = '# 标题\n\n<script>alert(1)</script>\n\n带 ![说明](https://example.org/image.png) 的正文';
  assert.doesNotMatch(prepare(source, markdownit).sections.join(''), /<script>|<img|image\.png/);
});

test('Zhihu Markdown mode keeps the byline and closing section while assigning three image slots', () => {
  const source = '# 文章标题\n\n作者：大书大 | 原创技术干货\n\n第一段\n\n![一](a.png)\n\n第二段\n\n![二](b.png)\n\n第三段\n\n![三](c.png)\n\n## 写在最后\n\n保留收尾';
  const article = prepare(source, markdownit, true, true);
  assert.equal(article.title, '文章标题');
  assert.equal(article.sections.length, 4);
  assert.match(article.sections[0], /原创技术干货/);
  assert.match(article.sections[3], /保留收尾/);
  assert.doesNotMatch(article.sections.join(''), /<img/);
});

for (const mode of ['normal', 'transformed', 'rejected', 'upload-corrupts-body']) test('article body and images: ' + mode, async () => {
  const actions = [], nodes = [{ textContent: '旧正文' }];
  let activeNode, drawerOpen = false, collapsed = false, selectedFile, uploaded = false;
  let caretRetries = 0;
  class Textarea {
    get value() { return this.text || ''; }
    set value(text) { this.text = text; }
    dispatchEvent() {}
    focus() {}
    blur() {}
  }
  class Transfer {
    files = [];
    items = { add: file => { this.files.push(file); } };
    setData(type, text) { if (type === 'text/plain') this.text = text; else this.html = text; }
  }
  let title = new Textarea();
  const checkbox = { checked: false };
  const label = { textContent: '个人观点，仅供参考', querySelector: () => checkbox, click: () => { checkbox.checked = true; } };
  const paragraph = text => ({
    textContent: text, scrollIntoView() {},
    contains: node => node?.parentElement?.textContent === text,
    cloneNode() { return { textContent: this.textContent, querySelectorAll: () => [] }; }
  });
  const input = {
    dispatchEvent(event) {
      if (event.type !== 'change') return;
      [selectedFile] = this.files;
      uploaded = false;
      setTimeout(() => { uploaded = true; }, 30);
    }
  };
  const rects = () => [1];
  const confirm = {
    getClientRects: rects,
    matches: () => !uploaded,
    click() {
      const file = selectedFile;
      assert.equal(uploaded, true);
      assert.equal(collapsed, true);
      actions.push(file.name);
      const index = nodes.indexOf(activeNode);
      assert.ok(index >= 0);
      const img = {
        textContent: '', complete: true, naturalWidth: 1600, src: 'https://example.org/' + file.name,
        parentElement: editor, isConnected: true,
        cloneNode() { return { textContent: '', querySelectorAll: () => [] }; }
      };
      nodes.splice(index, 0, img);
      if (mode === 'upload-corrupts-body') nodes.shift();
      drawerOpen = false;
      selectedFile = undefined;
    }
  };
  const toolbarButton = {
    getClientRects: rects, matches: () => false,
    closest: selector => selector === '.syl-toolbar-tool.static' ? {} : null,
    click() { drawerOpen = true; }
  };
  const drawer = { getClientRects: rects, querySelector: selector => selector.startsWith('.btn-upload-handle') ? input : null };
  const editor = {
    isConnected: true, focus() {}, querySelector: () => null,
    closest: () => ({ querySelectorAll: () => [toolbarButton] }),
    contains: node => nodes.includes(node),
    get textContent() { return nodes.map(node => node.textContent).join(''); },
    get children() { return nodes; },
    querySelectorAll: selector => nodes.filter(node => selector === 'img' ? node.src : !node.src),
    cloneNode() {
      const copy = { textContent: this.textContent || '请输入正文' };
      copy.querySelectorAll = () => this.textContent ? [] : [{ remove: () => { copy.textContent = ''; } }];
      return copy;
    },
    dispatchEvent({ clipboardData }) {
        assert.equal(clipboardData.files.length, 0);
        if (!actions.includes('正文')) {
          assert.equal(title.value, '测试标题');
          title = new Textarea();
        }
        actions.push('正文');
        if (mode !== 'rejected') {
          const html = mode === 'transformed' ? clipboardData.html.replace('<p>二</p>', '<p>貳</p>') : clipboardData.html;
          nodes.push(...[...html.matchAll(/<p>([^<]*)<\/p>/g)].map(m => paragraph(m[1])));
        }
    }
  };
  const document = {
    querySelector: selector => selector.startsWith('textarea') ? title : editor,
    querySelectorAll(selector) {
      if (selector === '.mp-ic-img-drawer') return drawerOpen ? [drawer] : [];
      if (selector === '[data-e2e="imageUploadConfirm-btn"]') return selectedFile ? [confirm] : [];
      return [label];
    },
    createTreeWalker(block) {
      let found = false;
      return { nextNode() {
        if (found) return null;
        found = true;
        return { data: block.textContent, length: block.textContent.length, parentElement: block };
      } };
    },
    createRange: () => ({ selectNodeContents(node) { this.node = node; }, collapse() { this.collapsed = true; } }),
    execCommand(command) {
      assert.equal(command, 'delete');
      if (activeNode === editor) { actions.push('清空'); nodes.length = 0; }
      else nodes.splice(nodes.indexOf(activeNode), 1);
      return true;
    },
    createElement: () => ({ set innerHTML(html) { this.content = { textContent: html.replace(/<[^>]+>/g, '') }; } })
  };
  const ctx = { document, location: { origin: 'https://mp.toutiao.com', pathname: '/profile_v4/graphic/publish' },
    NodeFilter: { SHOW_TEXT: 4 },
    window: { getSelection: () => ({
      removeAllRanges() {}, addRange(range) { activeNode = range.node; collapsed = Boolean(range.collapsed); },
      collapse(target) {
        activeNode = target.parentElement;
        // Simulate the first caret being replaced by the editor's selection reconciliation.
        collapsed = caretRetries++ > 0;
      },
      get isCollapsed() { return collapsed; }, get anchorNode() { return activeNode; }
    }) },
    DataTransfer: Transfer, ClipboardEvent: class { constructor(_, options) { Object.assign(this, options); } },
    File: class { constructor(_, name) { this.name = name; } }, HTMLTextAreaElement: Textarea, Event, atob, setTimeout,
    getComputedStyle: () => ({ visibility: 'visible' }) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../article-fill.js'), 'utf8'), ctx);
  const images = [1, 2, 3].map(i => ({ name: i + '.png', type: 'image/png', base64: 'YQ==' }));
  const result = await ctx.fillToutiaoArticle({ title: '测试标题', sections: ['<p>一</p>', '<p>二</p>', '<p>三</p>', '<p>四</p>'], images, overwrite: true });
  assert.equal(title.value, '测试标题');
  assert.equal(checkbox.checked, true);
  assert.match(result.message, /标题已填写/);
  if (mode === 'normal') {
    assert.deepEqual(actions, ['清空', '正文', '1.png', '2.png', '3.png']);
    assert.deepEqual(nodes.map(node => node.src?.split('/').at(-1) || node.textContent),
      ['一', '1.png', '二', '2.png', '三', '3.png', '四']);
    assert.match(result.message, /正文已确认 3\/3 张图片/);
  } else if (mode === 'upload-corrupts-body') {
    assert.deepEqual(actions, ['清空', '正文', '1.png', '清空', '正文']);
    assert.equal(editor.textContent, '一二三四');
    assert.match(result.message, /已恢复完整正文/);
  } else {
    assert.deepEqual(actions, ['清空', '正文']);
    assert.match(result.message, /已暂停插图/);
    assert.match(result.message, /正文已确认 0\/3 张图片/);
  }
});
