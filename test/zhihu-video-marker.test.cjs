const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Zhihu uses the marker overlay and confirms the choice before reporting it saved', async () => {
  let open = false, checked = false, confirmed = false, time = 0;
  const clicks = [];
  const node = (label, onClick = () => {}) => ({
    innerText: label, textContent: label, children: [],
    getClientRects: () => [1],
    getAttribute: () => null,
    matches: () => false,
    scrollIntoView() {},
    dispatchEvent(event) { if (event.type === 'click') onClick(); },
    querySelectorAll: () => [],
  });
  const preview = node('选择标记', () => clicks.push('展示控件'));
  const overlay = node('', () => { clicks.push('选择视频标记'); open = true; });
  overlay.closest = () => ({ querySelector: () => preview });
  const option = node('个人观点，仅供参考', () => { clicks.push('个人观点'); checked = true; });
  option.querySelector = () => ({ childElementCount: checked ? 1 : 0 });
  const confirm = node('确认', () => {
    clicks.push('确认');
    assert.equal(checked, true);
    confirmed = true;
    preview.innerText = option.innerText;
    open = false;
  });
  const modal = node('添加视频标记');
  modal.querySelectorAll = selector => selector.endsWith('ModalOption') ? [option] : [confirm];
  const context = vm.createContext({
    location: new URL('https://www.zhihu.com/upload-video'),
    window: {},
    MouseEvent: class { constructor(type) { this.type = type; } },
    Date: { now: () => time },
    setTimeout(fn, ms) { time += ms; fn(); },
    document: {
      querySelectorAll(selector) {
        if (selector.includes('videoTypeSelectOverlay')) return [overlay];
        if (selector.endsWith('ModalContent')) return open ? [modal] : [];
        return [];
      },
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../zhihu-fill.js'), 'utf8'), context);
  const data = { title: '测试视频', description: '测试简介' };
  const result = await context.fillZhihu(data, false);
  assert.deepEqual(clicks, ['选择视频标记', '个人观点', '确认']);
  assert.equal(confirmed, true);
  assert.match(result.message, /^视频标记：个人观点仅供参考/m);
  await context.fillZhihu(data, false);
  assert.equal(clicks.length, 3, 'an already saved marker must not reopen the modal');
});
