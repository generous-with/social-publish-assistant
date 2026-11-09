const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Toutiao article and video routes load separate panels and reject crossed fill messages', async () => {
  const origin = 'https://mp.toutiao.com';
  const article = origin + '/profile_v4/graphic/publish';
  const video = origin + '/profile_v4/xigua/upload-video';
  const injected = [];
  let open, receive;
  const context = vm.createContext({
    URL,
    importScripts() {},
    chrome: {
      action: { onClicked: { addListener(fn) { open = fn; } }, async setBadgeText() {}, async setTitle() {} },
      runtime: { onMessage: { addListener(fn) { receive = fn; } } },
      scripting: { async executeScript(config) { injected.push(config); return []; } }
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  await open({ id: 1, url: article + '?from=test' });
  await open({ id: 2, url: video });
  assert.deepEqual(Array.from(injected[0].files), ['markdown-it.min.js', 'article-markdown.js', 'article-panel.js']);
  assert.deepEqual(Array.from(injected[1].files), ['parser.js', 'panel.js']);

  for (const [url, type] of [[article, 'social-publish-fill'], [video, 'social-publish-fill-article']]) {
    let response;
    receive({ type }, { url, frameId: 0, tab: { id: 1 } }, result => { response = result; });
    assert.ok(response.message);
  }
  assert.equal(injected.length, 2);
});

test('Toutiao video settings still run if filling topics fails', async () => {
  let receive;
  const calls = [];
  const context = vm.createContext({
    URL, importScripts() {}, fillPlatform() {}, fillToutiaoVideoSettings() {},
    chrome: {
      action: { onClicked: { addListener() {} } },
      runtime: { onMessage: { addListener(fn) { receive = fn; } } },
      scripting: { async executeScript({ func }) {
        calls.push(func.name);
        return [{ result: func.name === 'fillPlatform' ? { ok: false, message: '话题填写失败' } : '已添加「关注引导 · 智能添加」贴纸' }];
      } }
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  const response = await new Promise(resolve => receive({ type: 'social-publish-fill' }, {
    url: 'https://mp.toutiao.com/profile_v4/xigua/upload-video', frameId: 0, tab: { id: 1 }
  }, resolve));
  assert.deepEqual(calls, ['fillPlatform', 'fillToutiaoVideoSettings']);
  assert.match(response.message, /话题填写失败\n已添加「关注引导 · 智能添加」贴纸/);
});

test('Zhihu article accepts the write page and auto-saved draft route only', async () => {
  let open, receive;
  const injected = [];
  const context = vm.createContext({
    URL, importScripts() {}, fillZhihuArticle() {},
    chrome: {
      action: { onClicked: { addListener(fn) { open = fn; } }, async setBadgeText() {}, async setTitle() {} },
      runtime: { onMessage: { addListener(fn) { receive = fn; } } },
      scripting: { async executeScript(config) { injected.push(config); return [{ result: { ok: true } }]; } }
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  const origin = 'https://zhuanlan.zhihu.com';
  const data = { title: '示例', sections: ['<p>正文</p>'], imageCount: 0 };
  const submit = (url, type) => new Promise(resolve => receive({ type, data }, {
    url, frameId: 0, tab: { id: 1 }
  }, resolve));
  for (const route of ['/write', '/p/123456789/edit']) {
    await open({ id: 1, url: origin + route });
    assert.deepEqual(Array.from(injected.at(-1).files), ['markdown-it.min.js', 'article-markdown.js', 'article-panel.js']);
    assert.equal((await submit(origin + route, 'social-publish-fill-zhihu-article')).ok, true);
    assert.equal(injected.at(-1).func.name, 'fillZhihuArticle');
    assert.equal(injected.at(-1).world, 'MAIN');
  }
  const count = injected.length;
  assert.equal((await submit('https://www.zhihu.com/upload-video', 'social-publish-fill-zhihu-article')).ok, false);
  assert.equal((await submit(origin + '/p/123456789', 'social-publish-fill-zhihu-article')).ok, false);
  assert.equal((await submit(origin + '/write', 'social-publish-fill-article')).message, '请打开今日头条文章编辑页');
  assert.equal(injected.length, count);
});
