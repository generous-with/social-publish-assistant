const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const code = require('node:fs').readFileSync(require.resolve('../toutiao-video-settings.js'), 'utf8');

function simulate() {
  const actions = [];
  let opened = false, configured = false, added = false;
  const node = (textContent, click) => ({
    textContent, click, isConnected: true, getClientRects: () => [1],
    getAttribute: () => null, matches: () => false, closest: () => null,
    contains: () => false, classList: { contains: () => false }
  });
  const checkbox = node('', () => { actions.push('自行拍摄'); checkbox.checked = true; });
  const declaration = { ...node('自行拍摄'), querySelector: () => checkbox };
  const radio = { ...node('', () => { actions.push('智能添加'); radio.checked = true; }), checked: false };
  const smart = { ...node('智能添加查看说明'), querySelector: () => radio,
    querySelectorAll: () => [node('智能添加')] };
  const card = { ...node('关注引导', () => { actions.push('关注引导'); configured = true; }), closest: () => dialog };
  const confirm = node('确定', () => {
    assert.equal(radio.checked, true);
    actions.push('贴纸确定');
    opened = false;
    dialog.isConnected = false;
    added = true;
  });
  const dialog = {
    ...node('添加互动贴纸 开始时间 持续时间'),
    querySelectorAll: selector => selector === '.community-sticker-btn' ? [card] :
      selector === 'label' ? (configured ? [smart] : []) :
      selector.startsWith('button') ? [confirm] : []
  };
  const trigger = node('+ 添加互动贴纸', () => { actions.push('添加贴纸'); opened = true; });
  const outsideConfirm = node('确定', () => { throw Error('点错窗口'); });
  const document = {
    querySelectorAll: selector => selector === 'label.byte-checkbox.checkbot-item' ? [declaration] :
      selector === '.community-sticker-btn' ? (opened ? [card] : []) :
      selector === 'span,div,p' ? (added ? [node('已添加贴纸修改 |')] : []) :
      selector === 'button,[role="button"],a,span,div' ? [trigger, outsideConfirm] : []
  };
  const context = { document, location: { origin: 'https://mp.toutiao.com', pathname: '/profile_v4/xigua/upload-video' },
    getComputedStyle: () => ({ visibility: 'visible' }), setTimeout };
  vm.runInNewContext(code, context);
  return { run: context.fillToutiaoVideoSettings, actions };
}

test('checks declaration and confirms the smart follow sticker inside its own dialog once', async () => {
  const { run, actions } = simulate();
  const result = await run();
  assert.deepEqual(actions, ['自行拍摄', '添加贴纸', '关注引导', '智能添加', '贴纸确定']);
  assert.match(result, /已勾选「自行拍摄」/);
  assert.match(result, /已添加「关注引导 · 智能添加」/);
  assert.match(await run(), /页面已有互动贴纸/);
  assert.equal(actions.length, 5);
});
