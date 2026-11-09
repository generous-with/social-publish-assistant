async function fillFacebook(data, overwrite) {
  try {
    if (location.origin !== 'https://www.facebook.com' || !/^\/post\/create\/?$/.test(location.pathname)) {
      throw Error('请打开 Facebook 发帖页 /post/create');
    }
    if (!data.description?.trim()) throw Error('帖子正文为空');

    const visible = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const all = (selector, root = document) => [...root.querySelectorAll(selector)].filter(visible);
    const text = e => (e.innerText ?? e.textContent).replace(/[\u200b\ufeff]/g, '').trim();
    const canon = s => s.replace(/[\u200b\ufeff]/g, '').replace(/\u00a0/g, ' ')
      .replace(/\r\n?/g, '\n').replace(/\n+/g, '\n').trim();
    const key = s => (s || '').replace(/[\s\u200b\ufeff：:]/g, '').toLowerCase();
    const names = /^(?:创建帖子|建立帖子|建立貼文|建立贴文|创建贴文|发帖|發帖|發佈貼文|Create post)$/i;
    const editorSelector = '[contenteditable=true][role=textbox],[contenteditable=true][data-lexical-editor=true],textarea';
    const popupSelector = '[role=dialog],[role=menu],[role=listbox]';
    const controls = 'button,[role=button],label,input,[role=switch],[role=checkbox],[role=radio],[role=option],[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox]';
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const until = async (read, timeout = 3000) => {
      const end = Date.now() + timeout;
      do {
        const value = read();
        if (value) return value;
        await wait(100);
      } while (Date.now() < end);
      return null;
    };
    const leaf = nodes => nodes.filter(e => !nodes.some(other => e !== other && e.contains(other)));
    const only = nodes => nodes.length === 1 ? nodes[0] : null;
    const editors = root => all(editorSelector, root).filter(e => e.tagName !== 'TEXTAREA' ||
      /描述|正文|简介|簡介|description/i.test([e.placeholder, e.getAttribute('aria-label')].join(' ')));
    const composer = () => {
      const named = root => names.test(root.getAttribute('aria-label') || '') ||
        all('h1,h2,h3,[role=heading],span,[role=dialog]', root).some(e =>
          !e.closest('[contenteditable=true],button,[role=button]') &&
          names.test(e.getAttribute('aria-label') || text(e)));
      const dialogs = leaf(all('[role=dialog]').filter(e => named(e) && editors(e).length === 1));
      if (dialogs.length) return only(dialogs);
      const standalone = only(leaf(all('main,[role=main]').filter(e => editors(e).length === 1)));
      return standalone || only(leaf(all('form').filter(e => editors(e).length === 1)));
    };
    const root = await until(composer, 5000);
    if (!root) throw Error('找不到唯一的 Facebook 发帖编辑器，请确认已登录并打开 /post/create');
    const editor = () => {
      const current = composer();
      const field = current && only(editors(current));
      if (!field) throw Error('找不到唯一的发帖正文');
      return field;
    };
    const read = e => e.tagName === 'TEXTAREA' ? e.value : text(e);
    const ed = editor(), existing = canon(read(ed)), expected = canon(data.description);
    if (existing && existing !== expected && !overwrite) throw Error('帖子已有不同正文，请勾选替换页面已有文案');
    const same = existing === expected;
    if (!same) {
      if (ed.tagName === 'TEXTAREA') {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ed, data.description);
        ed.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const selectBody = element => {
          element.focus();
          const range = document.createRange();
          range.selectNodeContents(element);
          const selection = getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        };
        selectBody(ed);
        const transfer = new DataTransfer();
        transfer.setData('text/plain', data.description);
        ed.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }));
        await wait(200);
        if (canon(read(editor())) !== expected) {
          selectBody(editor());
          if (!document.execCommand('insertText', false, data.description)) throw Error('Facebook 编辑器未接受正文');
        }
      }
      if (!await until(() => canon(read(editor())) === expected)) throw Error('正文未完整保留，请核对');
    }

    const settingNames = e => [e.getAttribute('aria-label'), e.getAttribute('title'), text(e)].map(key);
    const findSetting = (root, match) => only(leaf(all(controls, root).filter(e =>
      !e.closest('[contenteditable=true]') && settingNames(e).some(match))));
    const state = element => {
      if (!element) return undefined;
      const input = element.matches('input[type=checkbox],input[type=radio]') ? element :
        element.querySelector('input[type=checkbox],input[type=radio]');
      if (input) return input.checked;
      for (const attr of ['aria-checked', 'aria-selected', 'aria-pressed', 'data-state']) {
        const value = element.getAttribute(attr);
        if (value === 'true' || value === 'checked' || value === 'on') return true;
        if (value === 'false' || value === 'unchecked' || value === 'off') return false;
      }
      return undefined;
    };
    const activate = e => {
      if (e.matches(':disabled,[aria-disabled=true]')) throw Error('选项当前不可用');
      e.click();
    };
    const messagesName = value => /^(?:接收消息|接收訊息|接收信息|getmessages|receivemessages)$/.test(value);
    const aiName = value => /^(?:添加ai标签|添加ai標籤|addailabel|ai标签|ai標籤|ailabel)(?:开|開|关|關|开启|關閉|关闭|on|off)?$/.test(value);
    const aiState = e => {
      if (!e) return undefined;
      const labels = settingNames(e).filter(aiName);
      if (labels.some(v => /(?:开|開|开启|on)$/.test(v))) return true;
      if (labels.some(v => /(?:关|關|关闭|關閉|off)$/.test(v))) return false;
      return state(e);
    };
    async function enableMessages() {
      const locate = () => findSetting(composer() || root, messagesName);
      const enabled = () => state(locate()) === true || Boolean(findSetting(composer() || root,
        v => /^(?:移除接收消息|移除接收訊息|removegetmessages|removereceivemessages)$/.test(v)));
      if (enabled()) return '已选择「接收消息」';
      let control = locate();
      if (!control) {
        const addToPost = findSetting(composer() || root,
          v => /^(?:添加到帖子|添加到贴文|添加更多内容|新增至貼文|addtoyourpost)$/.test(v));
        if (addToPost) {
          const before = new Set(all(popupSelector));
          activate(addToPost);
          control = await until(() => only(leaf(all(popupSelector).filter(e => !before.has(e)))
            .map(popup => findSetting(popup, messagesName)).filter(Boolean)), 1500);
        }
      }
      if (!control) throw Error('未找到「接收消息」');
      if (state(control) !== true) activate(control);
      if (!await until(() => enabled() || (control.isConnected && state(control) === true), 1500)) {
        throw Error('未确认「接收消息」已选中');
      }
      return '已选择「接收消息」';
    }
    async function enableAi() {
      const locate = () => findSetting(composer() || root, aiName);
      const control = locate();
      if (!control) throw Error('未找到「添加 AI 标签」');
      if (aiState(control) === true) return 'AI 标签已打开';
      const before = new Set(all(popupSelector));
      activate(control);
      const afterClick = await until(() => {
        if (aiState(locate()) === true) return true;
        const fresh = leaf(all(popupSelector).filter(e => !before.has(e)));
        const matches = fresh.map(popup => findSetting(popup, aiName) ||
          (aiName(key(popup.getAttribute('aria-label'))) || /AI\s*[标標]籤|AI\s*标签|AI label/i.test(text(popup))
            ? findSetting(popup, v => /^(?:开|開|开启|開啟|on|enable)$/.test(v)) : null)).filter(Boolean);
        return only(matches);
      }, 1800);
      if (afterClick && afterClick !== true && aiState(afterClick) !== true) activate(afterClick);
      if (!await until(() => aiState(locate()) === true ||
          (afterClick && afterClick !== true && afterClick.isConnected && aiState(afterClick) === true), 1500)) {
        throw Error('未确认 AI 标签已打开');
      }
      return 'AI 标签已打开';
    }
    const result = [same ? '帖子已包含相同的抖音简介，无需重复填写' : '已填写抖音简介原文（含 #话题）'];
    for (const [label, configure] of [['接收消息', enableMessages], ['AI 标签', enableAi]]) {
      try { result.push(await configure()); }
      catch (error) { result.push(label + '待核对：' + error.message); }
    }
    return { ok: true, message: result.join('\n') + '\n请核对后手动发布。' };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}
