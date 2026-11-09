const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Zhihu article selects the spoiler statement and enables gifts without toggling either off on retry', async () => {
  const clicks = [];
  let settingsOpen = false, menuOpen = false, dialogOpen = false, time = 0;
  const element = (textContent, click = () => {}) => ({
    textContent, click, getClientRects: () => [1],
  });
  const open = element('发布设置', () => { clicks.push('settings'); settingsOpen = true; });
  const select = element('无声明', () => { clicks.push('menu'); menuOpen = true; });
  select.id = 'Popover7-toggle';
  select.getAttribute = name => name === 'aria-expanded' ? String(menuOpen) : null;
  const option = element('包含剧透', () => {
    clicks.push('spoiler');
    select.textContent = '包含剧透';
    menuOpen = false;
  });
  const radio = { type: 'radio', checked: false };
  const giftText = element('开启送礼物', () => { clicks.push('gifts'); dialogOpen = true; });
  const giftOption = { ...giftText, control: radio, querySelector: () => giftText };
  const confirm = element('确定', () => { clicks.push('confirm'); dialogOpen = false; radio.checked = true; });
  const dialog = { ...element('开启送礼物 即接受《知乎赞赏功能使用协议》'), querySelectorAll: () => [confirm] };
  const declaration = { ...element('创作声明\u200b'), parentElement: { querySelectorAll: () => [select] } };
  const gifts = { ...element('送礼物设置'), parentElement: { querySelectorAll: () => [giftOption], contains: node => node === radio } };
  const context = vm.createContext({
    location: new URL('https://zhuanlan.zhihu.com/p/123456/edit'),
    Date: { now: () => time },
    setTimeout(fn, ms) { time += ms; fn(); },
    document: {
      querySelectorAll(selector) {
        if (selector === 'button') return [open, element('发布', () => { throw Error('Unexpected publish'); })];
        if (selector === '.RewardForm-rewardModal') return dialogOpen ? [dialog] : [];
        return settingsOpen ? [declaration, gifts] : [];
      },
      getElementById(id) {
        return id === 'Popover7-content' && menuOpen ? { querySelectorAll: () => [option] } : null;
      },
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../zhihu-article-fill.js'), 'utf8'), context);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await context.fillZhihuArticle({ settingsOnly: true });
    assert.equal(result.ok, true, result.message);
    assert.match(result.message, /包含剧透/);
    assert.match(result.message, /送礼物已开启/);
  }
  assert.deepEqual(clicks, ['settings', 'menu', 'spoiler', 'gifts', 'confirm']);
});
