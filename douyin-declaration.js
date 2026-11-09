async function fillDouyinDeclaration() {
  if (location.origin !== 'https://creator.douyin.com' ||
      location.pathname !== '/creator-micro/content/post/video') {
    throw Error('请打开抖音视频发布页');
  }
  const target = '无需添加自主声明';
  const popupSelector = '.semi-modal,[role="dialog"],.semi-select-dropdown,[role="listbox"]';
  const clickable = 'button,[role="button"],[role="combobox"],.semi-select';
  const visible = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility === 'visible';
  const text = e => e.textContent.replace(/[\s\u200b\ufeff]/g, '');
  const query = (root, selector) => [...root.querySelectorAll(selector)].filter(visible);
  const exact = (root, value) => {
    const matches = query(root, 'button,label,span,div,p,li,[role="option"],[role="radio"]')
      .filter(e => text(e) === value);
    return matches.filter(e => !matches.some(child => child !== e && e.contains(child)));
  };
  const unique = elements => elements.length === 1 ? elements[0] : null;
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  const waitFor = async (read, timeout = 3000) => {
    const deadline = Date.now() + timeout;
    do {
      const result = read();
      if (result) return result;
      await pause();
    } while (Date.now() < deadline);
    return null;
  };

  const outside = e => !e.closest(popupSelector);
  const selected = () => exact(document, target).some(outside) ||
    query(document, 'input[placeholder*="自主声明"]').some(e => outside(e) && e.value === target);
  if (selected()) return '自主声明已为「无需添加自主声明」';

  const before = new Set(query(document, popupSelector));
  const declarationPopup = () => query(document, popupSelector)
    .find(e => e.matches('.semi-modal,[role="dialog"]') && /自主声明/.test(text(e)));
  let popup = declarationPopup();
  let trigger;
  if (!popup) {
    const prompt = unique(exact(document, '请选择自主声明').filter(outside)) ||
      unique(query(document, 'input[placeholder="请选择自主声明"]').filter(outside));
    trigger = prompt?.closest(clickable) || prompt;
    if (!trigger) {
      const label = unique(exact(document, '自主声明').filter(outside));
      for (let row = label?.parentElement, level = 0; row && level < 4; row = row.parentElement, level++) {
        const controls = query(row, clickable).filter(outside);
        const outer = controls.filter(e => !controls.some(other => other !== e && other.contains(e)));
        if (outer.length === 1) { trigger = outer[0]; break; }
        if (outer.length > 1) break;
      }
    }
    if (!trigger) throw Error('找不到唯一的「自主声明」入口，请确认视频已上传');
    trigger.scrollIntoView({ block: 'nearest' });
    trigger.click();
    popup = await waitFor(() => {
      const linkedId = trigger.getAttribute('aria-controls');
      const linked = linkedId && document.getElementById(linkedId);
      if (linked && visible(linked)) return linked;
      const fresh = query(document, popupSelector).filter(e => !before.has(e));
      return declarationPopup() || unique(fresh.filter(e => !fresh.some(other => other !== e && other.contains(e))));
    });
  }
  if (!popup) throw Error('未找到自主声明选项列表');

  const option = () => unique(exact(popup, target));
  const scrollable = e => e.clientHeight > 0 && e.scrollHeight > e.clientHeight + 1 &&
    /^(auto|scroll|overlay)$/.test(getComputedStyle(e).overflowY);
  const lists = [popup, ...query(popup, 'div,ul,ol,section,[role="listbox"]')].filter(scrollable);
  let choice = await waitFor(option, 500);
  const deadline = Date.now() + 7000;
  for (const list of lists) {
    if (choice) break;
    if (list.scrollTop) { list.scrollTop = 0; await pause(); }
    while (popup.isConnected && visible(popup) && Date.now() < deadline) {
      choice = option();
      if (choice) break;
      const previous = list.scrollTop;
      list.scrollTop += Math.max(1, Math.floor(list.clientHeight * 0.8));
      if (list.scrollTop === previous) break;
      await pause();
    }
  }
  if (!choice) throw Error('列表中未找到「无需添加自主声明」');

  for (let list = choice.parentElement; list && popup.contains(list); list = list.parentElement) {
    if (!scrollable(list)) continue;
    const item = choice.getBoundingClientRect();
    const top = list.getBoundingClientRect().top + list.clientTop;
    const bottom = top + list.clientHeight;
    if (item.top < top) list.scrollTop += Math.floor(item.top - top);
    else if (item.bottom > bottom) list.scrollTop += Math.ceil(item.bottom - bottom);
  }
  await pause();
  choice = option();
  if (!choice) throw Error('滚动后选项已变化，请重新打开自主声明');

  const wrapper = choice.closest('label,[role="radio"],.semi-radio');
  const radio = wrapper && popup.contains(wrapper) && (wrapper.querySelector('input[type="radio"]') ||
    (wrapper.matches('[role="radio"]') ? wrapper : null));
  const checked = () => radio?.checked || radio?.getAttribute('aria-checked') === 'true';
  const item = radio || choice.closest('[role="option"],.semi-select-option') || choice;
  if (!popup.contains(item) || item.matches(':disabled,[aria-disabled="true"]')) throw Error('目标声明选项不可用');
  if (!checked()) item.click();
  if (radio && !await waitFor(checked, 1200)) throw Error('未确认目标声明已勾选');

  if (popup.matches('.semi-modal,[role="dialog"]')) {
    const confirm = await waitFor(() => unique(query(popup, 'button,[role="button"]')
      .filter(e => text(e) === '确定' && !e.matches(':disabled,[aria-disabled="true"]'))), 1500);
    if (!confirm) throw Error('未找到自主声明窗口里的「确定」');
    confirm.click();
  }
  if (!await waitFor(selected)) throw Error('页面未显示「无需添加自主声明」，请核对');
  return '自主声明已选择「无需添加自主声明」';
}
