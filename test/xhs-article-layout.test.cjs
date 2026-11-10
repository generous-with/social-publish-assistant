const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const script = fs.readFileSync(require.resolve('../xhs-article-fill.js'), 'utf8');

function layoutPage({ legacyMenu = false, connected = false, failUpload = false } = {}) {
  let stage = 'layout', menuOpen = true, elapsed = 0;
  const actions = [];
  const show = (textContent = '', properties = {}) => ({
    textContent, getClientRects: () => [1], closest: () => null, getAttribute: () => null, ...properties,
  });
  const box = () => ({ left: 0, top: 0, width: 120, height: 160 });
  const selected = { layoutImage: { name: 'layout.png', type: 'image/png', size: 500 },
    firstImage: { name: 'first.png', type: 'image/png', size: 300 } };
  const status = {};
  const shadow = { getElementById: id => id === 'status' ? status : { files: [selected[id]] } };
  const card = (src, width = 120, height = 160) => show('', {
    hasAttribute: name => name === 'data-draggable',
    querySelector: () => ({ complete: true, naturalWidth: width, naturalHeight: height, getAttribute: () => src }),
  });
  class Input {
    type = 'file';
    accept = connected ? 'image/*' : 'image/png,image/jpeg';
    isConnected = connected;
    click() { actions.push('native-picker'); }
    dispatchEvent(event) {
      if (event.type !== 'change') return;
      const [file] = this.files;
      actions.push(file.name);
      if (file === selected.layoutImage && !failUpload) cover.style.backgroundImage = 'url("blob:uploaded")';
      if (file === selected.firstImage) list.children.push(card('blob:first', 800, 600));
    }
  }
  const layoutInput = new Input();
  const firstInput = new Input();
  const list = show('', { children: [card('blob:generated')],
    closest: selector => selector === '.img-list' ? { querySelector: () => firstInput } : null });
  list.Sortable1 = { option: name => name === 'onUpdate' ? event => {
    const [item] = list.children.splice(event.oldDraggableIndex, 1);
    list.children.splice(event.newDraggableIndex, 0, item);
  } : () => {} };
  const menu = show();
  const upload = show('从本地上传', {
    click() { actions.push('upload-click'); menuOpen = false; layoutInput.click(); },
    closest: selector => selector === '.image-menu' ? menu : null,
  });
  menu.querySelectorAll = selector => selector.includes('button') ? [upload] : [];
  const anchor = { getBoundingClientRect: box, dispatchEvent() { menuOpen = true; } };
  const cover = show('', { parentElement: anchor, style: { backgroundImage: 'url("blob:initial")' },
    closest: selector => selector === '.cover-container' ? { getBoundingClientRect: box, querySelectorAll: () => [] } : null,
    getBoundingClientRect: box });
  const next = show('下一步', { click() { actions.push('next'); stage = 'images'; } });
  const document = {
    getElementById: () => ({ shadowRoot: shadow }),
    querySelectorAll(selector) {
      if (stage === 'images') return selector === '.img-list .flex-list' ? [list] : [];
      if (selector === '.edit-left') return [show('示例文章')];
      if (selector === '.edit-left [data-dom-type="cover"]') return [cover];
      if (selector === 'button.submit') return [next];
      if (selector === '.image-menu,[role="menu"]') return menuOpen ? [menu] : [];
      if (selector === '.image-menu .menu-item') return menuOpen && legacyMenu ? [upload] : [];
      return [];
    },
    createElement: () => ({ getContext: () => ({
      scale() {}, drawImage() {},
      getImageData: () => ({ data: Array.from({ length: 24 * 24 * 4 }, (_, i) => i % 4 === 3 ? 255 : 100) }),
    }) }),
  };
  const context = vm.createContext({
    document, window: {}, URLSearchParams, HTMLInputElement: Input, Event, MouseEvent: Event, AbortSignal,
    location: { origin: 'https://creator.xiaohongshu.com', pathname: '/publish/publish', search: '?target=article' },
    Date: { now: () => elapsed }, setTimeout: (fn, ms) => { elapsed += ms; fn(); },
    DataTransfer: class { files = []; items = { add: file => this.files.push(file) }; },
    getComputedStyle: () => ({ backgroundPosition: '50% 50%', backgroundSize: 'cover' }),
    fetch: async () => ({ ok: true, blob: async () => ({}) }),
    createImageBitmap: async () => ({ width: 120, height: 160, close() {} }),
  });
  vm.runInContext(script, context);
  const fill = () => context.prepareXhsArticle({ title: '示例文章', bodyText: '示例正文', bodyHtml: '<p>示例正文</p>' });
  return { actions, fill, status, list };
}

for (const [name, options] of [
  ['legacy menu with a detached picker', { legacyMenu: true }],
  ['visible local-upload button without the legacy class', {}],
  ['connected file picker accepting image/*', { legacyMenu: true, connected: true }],
]) test('XHS layout advances to image editing: ' + name, async () => {
  const page = layoutPage(options);
  const result = await page.fill();
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(page.actions, ['upload-click', 'layout.png', 'next', 'first.png']);
  assert.deepEqual(page.list.children.map(card => card.querySelector().getAttribute('src')), ['blob:first', 'blob:generated']);
});

test('XHS keeps the article on the layout page if the platform never confirms the upload', async () => {
  const page = layoutPage({ failUpload: true });
  const result = await page.fill();
  assert.equal(result.ok, false);
  assert.match(result.message, /未确认排版配图上传成功/);
  assert.match(page.status.textContent, /等待封面预览更新/);
  assert.deepEqual(page.actions, ['upload-click', 'layout.png']);
});
