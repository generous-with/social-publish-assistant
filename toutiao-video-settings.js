async function fillToutiaoVideoSettings() {
  if (location.origin !== 'https://mp.toutiao.com' ||
      location.pathname !== '/profile_v4/xigua/upload-video') {
    throw Error('请打开今日头条视频发布页');
  }

  const visible = element => element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden';
  const text = element => element.textContent.replace(/\s+/g, '').trim();
  const unique = (root, selector, predicate) => {
    const matches = [...root.querySelectorAll(selector)].filter(e => visible(e) && predicate(e));
    return matches.length === 1 ? matches[0] : null;
  };
  const enabled = element => !element.matches(':disabled,[aria-disabled="true"]');
  const controls = 'button,[role="button"],a';
  const dialogSelector = '[role="dialog"],.byte-modal,[aria-modal="true"]';
  const labelMatches = (element, value) => text(element) === value ||
    [...element.querySelectorAll('span,p,div')].some(child => text(child) === value);
  const triggerLabel = element => /^\+?(添加贴纸|添加互动贴纸)$/.test(text(element));
  const stickerTrigger = () => {
    const nodes = [...document.querySelectorAll('button,[role="button"],a,span,div')]
      .filter(e => visible(e) && triggerLabel(e) && !e.closest(dialogSelector) &&
        !e.closest(':disabled,[aria-disabled="true"]'));
    const leaves = nodes.filter(e => !nodes.some(child => child !== e && e.contains(child)));
    return leaves.length === 1 ? leaves[0] : null;
  };
  const waitFor = async (read, timeout = 5000) => {
    const deadline = Date.now() + timeout;
    do {
      const value = read();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    return null;
  };

  async function setDeclaration() {
    const label = unique(document, 'label.byte-checkbox.checkbot-item', e => text(e) === '自行拍摄') ||
      unique(document, 'label', e => text(e) === '自行拍摄' && e.querySelector('input[type="checkbox"]'));
    const checkbox = label?.querySelector('input[type="checkbox"]');
    if (!checkbox) throw Error('未找到「自行拍摄」');
    if (!checkbox.checked && enabled(checkbox)) checkbox.click();
    if (!await waitFor(() => label.querySelector('input[type="checkbox"]')?.checked, 1200)) {
      throw Error('未确认「自行拍摄」已勾选');
    }
    return '作品声明已勾选「自行拍摄」';
  }

  const followCard = root => unique(root, '.community-sticker-btn', e => labelMatches(e, '关注引导'));
  function stickerDialog() {
    const card = followCard(document);
    const dialog = card?.closest(dialogSelector);
    if (dialog && text(dialog).includes('添加互动贴纸')) return dialog;
    for (let parent = card?.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      if (text(parent).includes('添加互动贴纸')) return parent;
    }
    return null;
  }
  const added = () => [...document.querySelectorAll('span,div,p')].some(e =>
    visible(e) && /^已添加贴纸(?:修改[|｜]?)?$/.test(text(e)));
  const smartOption = dialog => unique(dialog, 'label', e =>
    labelMatches(e, '智能添加') && e.querySelector('input[type="radio"]')) ||
    unique(dialog, '[role="radio"]', e => labelMatches(e, '智能添加'));
  const smartChecked = option => option?.getAttribute('aria-checked') === 'true' ||
    option?.querySelector('input[type="radio"]')?.checked === true;

  async function setSticker() {
    let dialog = stickerDialog();
    if (!dialog) {
      const edit = added() && unique(document, 'span.change', e =>
        text(e) === '修改' && /^已添加贴纸修改$/.test(text(e.parentElement)));
      if (added() && !edit) return '页面已有互动贴纸，请核对是否为「关注引导 · 智能添加」';
      const trigger = edit || await waitFor(stickerTrigger, 3000);
      if (!trigger) throw Error('未找到「添加贴纸」');
      trigger.click();
      dialog = await waitFor(stickerDialog);
    }
    if (!dialog) throw Error('未找到「添加互动贴纸」窗口');

    const card = followCard(dialog);
    if (!card) throw Error('未找到「关注引导」卡片');
    if (!card.classList.contains('community-sticker-btn-disabled')) card.click();
    const currentDialog = () => stickerDialog() ||
      (dialog.isConnected && visible(dialog) && smartOption(dialog) ? dialog : null);
    const currentOption = () => {
      const active = currentDialog();
      return active ? smartOption(active) : null;
    };
    const option = await waitFor(currentOption);
    if (!option) throw Error('未找到「智能添加」');
    const usesSmartTime = () => text(currentDialog() || dialog).includes('根据用户高频互动位置智能更新');
    if (!smartChecked(option) && !usesSmartTime() && enabled(option)) {
      const input = option.querySelector('input[type="radio"]');
      (input && enabled(input) ? input : option).click();
    }
    if (!await waitFor(() => smartChecked(currentOption()) || usesSmartTime(), 1500)) {
      throw Error('未确认「智能添加」已选中');
    }

    const active = currentDialog();
    const confirm = active && unique(active, controls, e => enabled(e) && text(e) === '确定');
    if (!confirm) throw Error('未找到贴纸窗口中的「确定」');
    confirm.click();
    if (!await waitFor(() => !currentDialog() && added(), 10000)) throw Error('未确认贴纸添加成功，请检查页面');
    return '已添加「关注引导 · 智能添加」贴纸';
  }

  const messages = [];
  for (const [name, configure] of [['作品声明', setDeclaration], ['互动贴纸', setSticker]]) {
    try { messages.push(await configure()); }
    catch (error) { messages.push(name + '待核对：' + error.message); }
  }
  return messages.join('\n');
}
