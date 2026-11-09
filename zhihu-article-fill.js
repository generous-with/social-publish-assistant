async function fillZhihuArticle({ title, sections, imageCount, overwrite, settingsOnly }) {
  const messages = [];
  const onArticle = () => location.origin === 'https://zhuanlan.zhihu.com' &&
    /^\/(?:write|p\/\d+\/edit)\/?$/.test(location.pathname);
  const one = (selector, root = document) => {
    const matches = root.querySelectorAll(selector);
    return matches.length === 1 ? matches[0] : null;
  };
  const getTitle = () => one('textarea[placeholder^="请输入标题"]');
  const getEditor = () => one('.PostEditor .public-DraftEditor-content[contenteditable="true"]');
  const getCoverInput = () => one('input.UploadPicture-input[type="file"]');
  const getCover = () => one('img[alt="封面图"]', getCoverInput()?.closest('.UploadPicture-wrapper')?.parentElement || document);
  const bodyImages = () => [...(getEditor()?.querySelectorAll('figure img') || [])];
  const validImage = image => image?.complete && image.naturalWidth > 0 && /^https?:/.test(image.src);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (check, error, timeout = 4000) => {
    const end = Date.now() + timeout;
    do {
      if (!onArticle()) throw Error('已离开知乎文章编辑页');
      const result = check();
      if (result) return result;
      await pause(100);
    } while (Date.now() < end);
    throw Error(error);
  };
  const normalize = value => value.replace(/[\s\u200b\u2060\ufeff]/g, '');
  function textNodes(editor) {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement.closest('[data-text="true"]') &&
          !node.parentElement.closest('figure,[contenteditable="false"]') && normalize(node.data)) nodes.push(node);
    }
    return nodes;
  }
  const bodyText = () => textNodes(getEditor()).map(node => normalize(node.data)).join('');
  function setRange(editor, range) {
    editor.focus();
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  }
  async function placeCursor(offset) {
    const editor = getEditor();
    let remaining = offset;
    for (const node of textNodes(editor)) {
      const length = normalize(node.data).length;
      if (remaining > length) { remaining -= length; continue; }
      let index = remaining === length ? node.length : 0;
      if (!index) for (; remaining > 0; index++) {
        if (normalize(node.data[index])) remaining--;
      }
      const range = document.createRange();
      range.setStart(node, index);
      range.collapse(true);
      setRange(editor, range);
      await pause(120);
      const selection = getSelection();
      return selection.isCollapsed && selection.anchorNode === node && selection.anchorOffset === index;
    }
    return false;
  }
  function upload(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function pictureKey(url) {
    try { return new URL(url).pathname.split('~')[0]; }
    catch { return ''; }
  }
  async function applyPublishSettings() {
    const errors = [];
    const labelText = element => (element?.textContent || '').replace(/[\s\u200b\ufeff]/g, '');
    const visible = element => element.getClientRects().length > 0;
    const match = (selector, text, root = document) => {
      const items = [...root.querySelectorAll(selector)].filter(element => visible(element) && labelText(element) === text);
      return items.length === 1 ? items[0] : null;
    };
    const row = text => match('label', text)?.parentElement;
    if (!row('创作声明') && !row('送礼物设置')) {
      const open = await wait(() => match('button', '发布设置'), '未找到知乎文章的「发布设置」');
      open.click();
      await wait(() => row('创作声明') || row('送礼物设置'), '发布设置未打开');
    }
    try {
      const trigger = () => {
        const declaration = row('创作声明');
        return declaration && one('button[role="combobox"]', declaration);
      };
      const select = await wait(trigger, '未找到「创作声明」下拉框');
      if (labelText(select) !== '包含剧透') {
        if (select.disabled) throw Error('「创作声明」下拉框不可用');
        if (select.getAttribute('aria-expanded') !== 'true') select.click();
        const option = await wait(() => {
          const button = trigger();
          if (button?.getAttribute('aria-expanded') !== 'true') return null;
          const id = button.getAttribute('aria-controls') ||
            (button.id.endsWith('-toggle') ? button.id.replace(/-toggle$/, '-content') : '');
          const menu = id && document.getElementById(id);
          return menu && match('button[role="option"]', '包含剧透', menu);
        }, '创作声明菜单里未找到「包含剧透」');
        if (option.disabled) throw Error('「包含剧透」选项不可用');
        option.click();
        await wait(() => labelText(trigger()) === '包含剧透', '选择后未确认「包含剧透」');
      }
      messages.push('创作声明已选择「包含剧透」');
    } catch (error) { errors.push('创作声明：' + error.message); }
    try {
      const giftOption = () => {
        const gift = row('送礼物设置');
        const label = gift && match('label[for]', '开启送礼物', gift);
        const input = label?.control;
        return input?.type === 'radio' && gift.contains(input) ? { input, label } : null;
      };
      const confirmation = () => {
        const dialogs = [...document.querySelectorAll('.RewardForm-rewardModal')].filter(dialog =>
          visible(dialog) && labelText(dialog).includes('知乎赞赏功能使用协议'));
        return dialogs.length === 1 ? match('button', '确定', dialogs[0]) : null;
      };
      const option = await wait(giftOption, '未找到「开启送礼物」单选项');
      if (!option.input.checked) {
        if (option.input.disabled) throw Error('「开启送礼物」不可用');
        if (!confirmation()) {
          (option.label.querySelector('.RadioButtonSet-label') || option.label).click();
        }
        await wait(() => giftOption()?.input.checked || confirmation(), '未出现送礼物确认或开启状态');
        if (!giftOption()?.input.checked) {
          const confirm = confirmation();
          if (!confirm || confirm.disabled) throw Error('送礼物确认按钮不可用');
          confirm.click();
        }
        await wait(() => giftOption()?.input.checked, '操作后未确认送礼物已开启');
      }
      messages.push('送礼物已开启');
    } catch (error) { errors.push('送礼物设置：' + error.message); }
    return { ok: !errors.length, message: [...messages, ...errors.map(error => '未完成：' + error),
      '请核对后手动发布。'].join('\n') };
  }

  try {
    if (!onArticle()) throw Error('请打开知乎专栏文章编辑页');
    if (settingsOnly === true) return await applyPublishSettings();
    if (!title?.trim() || !Array.isArray(sections) || ![0, 3].includes(imageCount) || sections.length !== imageCount + 1) {
      throw Error('请先导入有效的 Markdown，并选择零张或三张正文配图');
    }
    const panel = document.getElementById('social-publish-article-panel')?.shadowRoot;
    const files = [...(panel?.getElementById('images')?.files || [])];
    const coverFile = panel?.getElementById('cover')?.files?.[0];
    const validFile = file => file?.size > 0 && ['image/jpeg', 'image/png'].includes(file.type);
    if (!validFile(coverFile) || files.length !== imageCount || files.some(file => !validFile(file))) {
      throw Error('请重新选择 16:9 封面和正文配图，使用 JPEG 或 PNG');
    }
    const field = await wait(getTitle, '尚未找到知乎文章标题框');
    const editor = await wait(getEditor, '尚未找到知乎文章正文编辑器');
    if (!getCoverInput()) throw Error('尚未找到知乎「添加文章封面」控件');
    if (files.length && !one('.PostEditor input[type="file"][accept^="image/"][multiple]')) {
      throw Error('尚未找到知乎正文图片上传控件');
    }
    if (!overwrite && (field.value.trim() || bodyText() || bodyImages().length || getCover())) {
      throw Error('页面已有标题、正文或封面，请确认后勾选替换');
    }
    if (title.length > (field.maxLength > 0 ? field.maxLength : 100)) throw Error('标题超出知乎编辑器限制');
    const parser = new DOMParser();
    const parts = sections.map(html => parser.parseFromString(html, 'text/html').body.textContent);
    const expected = parts.map(normalize).join('');
    if (!expected) throw Error('文章正文为空');

    field.focus();
    field.select();
    document.execCommand('insertText', false, title);
    await wait(() => getTitle()?.value === title, '标题写入后未保留');
    messages.push('标题已填写');
    const currentEditor = getEditor() || editor;
    const range = document.createRange();
    range.selectNodeContents(currentEditor);
    setRange(currentEditor, range);
    await pause(120);
    const clipboard = new DataTransfer();
    clipboard.setData('text/html', sections.join(''));
    clipboard.setData('text/plain', parts.join('\n'));
    currentEditor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
    await wait(() => getEditor() && bodyText() === expected && !bodyImages().length,
      '知乎正文回读与预览不一致，已停止上传配图');
    messages.push('正文已填写');

    // Work backwards so adjacent image slots keep their original order.
    const inserted = [];
    for (let index = files.length - 1; index >= 0; index--) {
      const prefix = parts.slice(0, index + 1).map(normalize).join('');
      if (!await placeCursor(prefix.length)) throw Error('未能定位第 ' + (index + 1) + ' 张正文配图的位置');
      const input = one('.PostEditor input[type="file"][accept^="image/"][multiple]');
      if (!input) throw Error('知乎正文图片上传控件已消失');
      const count = bodyImages().length;
      upload(input, files[index]);
      const image = await wait(() => {
        const images = bodyImages();
        if (images.length !== count + 1) return false;
        const newest = images[0];
        if (newest.closest('figure')?.textContent.includes('上传失败')) {
          throw Error('知乎提示第 ' + (index + 1) + ' 张正文配图上传失败，请检查图片后重试');
        }
        return validImage(newest) && newest;
      }, '未确认第 ' + (index + 1) + ' 张正文配图上传成功', 45000);
      const before = textNodes(getEditor()).filter(node => node.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING)
        .map(node => normalize(node.data)).join('');
      if (before !== prefix || bodyText() !== expected) throw Error('正文配图位置或正文内容与预览不一致，请检查');
      inserted.unshift(pictureKey(image.src));
    }
    if (inserted.length) {
      if (bodyImages().map(image => pictureKey(image.src)).join('\n') !== inserted.join('\n')) {
        throw Error('正文配图顺序未确认，请检查编辑页');
      }
      messages.push('已确认 3 张正文配图及顺序');
    }
    const previousCover = getCover();
    const previousCoverSrc = previousCover?.src;
    const coverInput = getCoverInput();
    if (!coverInput) throw Error('知乎封面上传控件已消失');
    upload(coverInput, coverFile);
    await wait(() => {
      const cover = getCover();
      return validImage(cover) && (cover !== previousCover || cover.src !== previousCoverSrc);
    }, '未确认 16:9 封面上传成功，请检查封面区域', 45000);
    messages.push('16:9 封面已上传');
    return await applyPublishSettings();
  } catch (error) {
    return { ok: false, message: [...messages, '未完成：' + error.message].join('\n') };
  }
}
