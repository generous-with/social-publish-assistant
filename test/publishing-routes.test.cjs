const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const loadBackground = require('./load-background.cjs');

test('every supported publishing page opens its panel and runs only its own workflow', async () => {
  let open, receive;
  const calls = [];
  loadBackground(vm.createContext({
    URL,
    chrome: {
      action: { onClicked: { addListener(fn) { open = fn; } }, async setBadgeText() {}, async setTitle() {} },
      runtime: { onMessage: { addListener(fn) { receive = fn; } } },
      scripting: { async executeScript(options) {
        calls.push(options);
        return [{ result: { ok: true, message: '完成' } }];
      } },
    },
  }));
  const article = (url, suffix, adapter, panel = 'article-panel.js') =>
    [url, panel, [adapter], 'social-publish-fill-' + suffix];
  const workflows = [
    ['https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page', 'panel.js', ['fillPlatform', 'fillDouyinDeclaration']],
    ['https://mp.toutiao.com/profile_v4/xigua/upload-video', 'panel.js', ['fillPlatform', 'fillToutiaoVideoSettings']],
    article('https://mp.toutiao.com/profile_v4/graphic/publish', 'article', 'fillToutiaoArticle'),
    ['https://member.bilibili.com/platform/upload/video/frame', 'panel.js', ['fillBili']],
    ['https://creator.xiaohongshu.com/publish/publish?target=video', 'panel.js', ['fillXhs']],
    ['https://creator.xiaohongshu.com/publish/publish?target=article', 'xhs-article-panel.js',
      ['prepareXhsArticle', 'fillXhs'], 'social-publish-fill-xhs-article'],
    ['https://www.zhihu.com/upload-video?entry=navPanel', 'panel.js', ['fillZhihu']],
    article('https://zhuanlan.zhihu.com/p/123/edit', 'zhihu-article', 'fillZhihuArticle'),
    ['https://studio.youtube.com/channel/test/videos/upload?d=ud', 'panel.js', ['fillYouTube']],
    ['https://www.facebook.com/post/create', 'panel.js', ['fillFacebook']],
    ['https://x.com/home', 'panel.js', ['fillX']],
  ];
  const submit = (url, type, frameId = 0) => new Promise(resolve =>
    receive({ type, data: {}, overwrite: true }, { tab: { id: 5 }, url, frameId }, resolve));
  const writeCommands = new Set(workflows.map(([, , , type = 'social-publish-fill']) => type));
  for (const [url, panel, adapters, type = 'social-publish-fill'] of workflows) {
    calls.length = 0;
    await open({ id: 5, url });
    assert.equal(calls[0].files.at(-1), panel, url);
    assert.equal(calls[0].world, 'ISOLATED', url);
    for (const wrongCommand of writeCommands) {
      if (wrongCommand !== type) assert.equal((await submit(url, wrongCommand)).ok, false, url);
    }
    assert.equal((await submit(url, type, 3)).ok, false, url);
    assert.equal(calls.length, 1, url);
    assert.equal((await submit(url, type)).ok, true, url);
    assert.deepEqual(calls.slice(1).map(call => call.func.name), adapters, url);
    assert.ok(calls.every(call => call.target.tabId === 5), url);
  }

  calls.length = 0;
  const clear = 'social-publish-clear-bili-tags';
  assert.equal((await submit('https://member.bilibili.com/platform/upload/video-tools', clear)).ok, false);
  assert.equal((await submit(workflows[1][0], clear)).ok, false);
  assert.equal((await submit(workflows[3][0], clear, 1)).ok, false);
  await open({ id: 5, url: 'https://mp.toutiao.com.evil.test/profile_v4/graphic/publish' });
  assert.equal(calls.length, 0);
  assert.equal((await submit(workflows[3][0], clear)).ok, true);
  assert.deepEqual(calls.map(call => call.func.name), ['clearBiliTags']);
});
