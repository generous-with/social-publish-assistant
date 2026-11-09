async function fillToutiaoArticle({ title, sections, images, overwrite }) {
  if (location.origin !== 'https://mp.toutiao.com' || location.pathname !== '/profile_v4/graphic/publish') {
    throw Error('请打开今日头条文章编辑页');
  }
  const getTitleInput = () => document.querySelector('textarea[placeholder^="请输入文章标题"]');
  const titleInput = getTitleInput();
  const getEditor = () => document.querySelector('.syl-editor .ProseMirror[contenteditable="true"]');
  let editor = getEditor();
  if (!titleInput || !editor) throw Error('尚未找到头条文章标题或正文编辑器');
  const readText = node => {
    // The rendered code widget includes line numbers and repeated code text.
    // ProseMirror's document node contains the article text without those decorations.
    const descriptor = node.pmViewDesc;
    if (descriptor?.dom === node && typeof descriptor.node?.textContent === 'string') {
      return descriptor.node.textContent;
    }
    const copy = node.cloneNode(true);
    copy.querySelectorAll('.syl-placeholder,figcaption').forEach(node => node.remove());
    return copy.textContent;
  };
  const bodyText = () => readText(editor);
  const bodyEmpty = () => !bodyText().trim() && !editor.querySelector('img,video');
  if (!overwrite && (titleInput.value.trim() || !bodyEmpty())) {
    throw Error('页面已有文案。如需覆盖，请勾选“替换页面已有文案”');
  }
  if (titleInput.maxLength > 0 && title.length > titleInput.maxLength) throw Error('标题超出页面限制，请缩短后再填写');

  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const select = async (node, atStart) => {
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    if (atStart !== undefined) range.collapse(atStart);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    // The site's editor reconciles DOM selection with its document model asynchronously.
    await pause(100);
  };
  const paste = data => editor.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: data, bubbles: true, cancelable: true
  }));
  const normalize = text => text.replace(/[\s\u200b\u2060\ufeff]/g, '');
  const waitFor = async (check, timeout) => {
    const deadline = Date.now() + timeout;
    do {
      const value = check();
      if (value) return value;
      await pause(100);
    } while (Date.now() < deadline && editor.isConnected);
    return false;
  };
  const titleMatches = () => getTitleInput()?.value === title;
  const writeTitle = async () => {
    if (titleMatches()) return true;
    const input = getTitleInput();
    if (!input) return false;
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, title);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    return Boolean(await waitFor(titleMatches, 1200));
  };
  const uploadedImageCount = () => {
    const model = editor.pmViewDesc?.node;
    if (typeof model?.descendants === 'function') {
      let count = 0;
      model.descendants(node => {
        if (node.type.name === 'image') count++;
      });
      return count;
    }
    const blocks = new Set();
    for (const img of editor.querySelectorAll('img')) {
      if (!img.complete || img.naturalWidth <= 0 || !/^https?:/.test(img.currentSrc || img.src) ||
          img.closest?.('.img-loading-container')) continue;
      blocks.add(img.closest?.('figure,[data-node-type="image"],.pgc-img') || img);
    }
    return blocks.size;
  };
  const visible = node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const imageDrawer = () => [...document.querySelectorAll('.mp-ic-img-drawer')].find(visible);
  const uploadConfirm = '[data-e2e="imageUploadConfirm-btn"]';
  function findImageButton() {
    const scopes = [editor.closest('.syl-editor-wrap'), document].filter(Boolean);
    const action = 'button,[role="button"],.syl-toolbar-button,.syl-toolbar-tool';
    const eligible = nodes => [...new Set(nodes)].filter(node => node && visible(node) &&
      !node.matches(':disabled,[aria-disabled="true"]') &&
      !node.closest('.syl-toolbar-tool.disable,.mp-ic-img-drawer'));
    for (const root of scopes) {
      const imageTools = [...root.querySelectorAll('.syl-toolbar-tool.image .syl-toolbar-button')];
      const staticTools = eligible(imageTools.filter(node => node.closest('.syl-toolbar-tool.static')));
      if (staticTools.length === 1) return staticTools[0];
      const known = eligible(imageTools);
      if (known.length === 1) return known[0];

      const named = [...root.querySelectorAll('button,[role="button"],.syl-toolbar-button')].filter(node =>
        [node.getAttribute('aria-label'), node.getAttribute('title'), node.getAttribute('data-tooltip')]
          .some(label => /^(添加图片|插入图片|上传图片)(?:\s*Ctrl\s*\+\s*P)?$/i.test(label?.trim() || '')));
      const icons = [...root.querySelectorAll('svg')].filter(svg =>
        svg.querySelector('g[transform="translate(3.7 5)"] rect[width="16"][height="14"]') &&
        svg.querySelector('circle[cx="4.25"][cy="4.25"][r="1.25"]') &&
        svg.querySelector('path[d^="M1 12.5l7.921-5.469"]'));
      const matches = eligible([...named, ...icons.map(svg => svg.closest(action))]);
      const staticMatches = matches.filter(node => node.closest('.syl-toolbar-tool.static'));
      if (staticMatches.length === 1) return staticMatches[0];
      if (matches.length === 1) return matches[0];
    }
    return null;
  }
  async function placeImageCaret(offset) {
    for (let attempt = 0; attempt < 3; attempt++) {
      editor = getEditor();
      const boundary = editor && locateBoundary(offset);
      if (!boundary) return false;
      const { block, atStart } = boundary;
      block.scrollIntoView({ block: 'nearest' });
      editor.focus({ preventScroll: true });
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let target;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!normalize(node.data) || node.parentElement?.closest?.('[contenteditable="false"],figcaption')) continue;
        target = node;
        if (atStart) break;
      }
      const selection = window.getSelection();
      if (target) selection.collapse(target, atStart ? 0 : target.length);
      else await select(block, atStart);
      await pause(75);
      const current = window.getSelection();
      if (editor.contains(block) && current.isCollapsed &&
          (current.anchorNode === block || block.contains(current.anchorNode))) return true;
    }
    return false;
  }
  async function insertImage(image, offset) {
    if (imageDrawer() || [...document.querySelectorAll(uploadConfirm)].some(visible)) {
      throw Error('请先处理编辑器里已打开的图片上传窗口');
    }
    const before = uploadedImageCount();
    const bytes = Uint8Array.from(atob(image.base64), ch => ch.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], image.name, { type: image.type }));
    if (!await placeImageCaret(offset)) {
      throw Error('无法在段落边界放置插图光标');
    }
    if (!await waitFor(findImageButton, 2200)) {
      throw Error('未找到可用的编辑器图片按钮，请核对工具栏是否启用');
    }
    if (!await placeImageCaret(offset)) throw Error('编辑器插图光标已变化');
    const button = findImageButton();
    if (!button) throw Error('图片工具栏已重绘，请重试');
    button.click();
    let insertedImage;
    try {
      const input = await waitFor(() =>
        imageDrawer()?.querySelector('.btn-upload-handle input[type="file"][accept*="image"]'), 3500);
      if (!input) throw Error('图片窗口未出现本地上传控件');
      input.files = transfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      let confirmed = false, sawConfirm = false;
      insertedImage = await waitFor(() => {
        if (uploadedImageCount() > before) return true;
        if (confirmed) return null;
        // The upload confirmation can be mounted outside the initial image drawer.
        const actions = [...document.querySelectorAll(uploadConfirm)].filter(visible);
        if (actions.length) sawConfirm = true;
        const action = actions.length === 1 ? actions[0] : null;
        if (!action || action.matches(':disabled,[aria-disabled="true"],[aria-busy="true"],.byte-btn-loading')) return null;
        confirmed = true;
        action.click();
        return null;
      }, 45000);
      if (!insertedImage) {
        if (confirmed) throw Error('已点击图片上传的确定，但正文未出现图片');
        if (sawConfirm) throw Error('上传确认按钮未就绪，请检查图片上传状态');
        throw Error('未看到图片上传的确定按钮，请检查上传窗口');
      }
      return insertedImage;
    } finally {
      const close = insertedImage && imageDrawer()?.querySelector('.byte-drawer-close-icon');
      if (close) {
        close.click();
        await waitFor(() => !imageDrawer(), 1800);
      }
    }
  }
  async function clearBody() {
    if (bodyEmpty()) return true;
    await select(editor);
    document.execCommand('delete');
    return Boolean(await waitFor(bodyEmpty, 1800));
  }

  const parts = sections.map(html => {
    const fragment = document.createElement('template');
    fragment.innerHTML = html;
    return fragment.content.textContent;
  });
  const plain = parts.join('\n');
  const expected = normalize(plain);
  const matchesBody = () => normalize(bodyText()) === expected;
  async function writeBody() {
    const transfer = new DataTransfer();
    transfer.setData('text/html', sections.join(''));
    transfer.setData('text/plain', plain);
    await select(editor, true);
    paste(transfer);
    return Boolean(await waitFor(matchesBody, 1800));
  }
  function locateBoundary(offset) {
    let position = 0, lastTextBlock;
    for (const block of editor.children) {
      const length = normalize(readText(block)).length;
      if (!length) continue;
      if (position === offset) return { block, atStart: true };
      position += length;
      if (position > offset) return null;
      lastTextBlock = block;
    }
    return position === offset && lastTextBlock ? { block: lastTextBlock, atStart: false } : null;
  }

  await writeTitle();
  editor = getEditor();
  if (!editor) throw Error(titleMatches() ? '标题已填写，正文编辑器未就绪' : '编辑器未就绪，请重试');
  if (overwrite && !await clearBody()) throw Error('未确认旧正文已清空，已停止填写正文，请核对编辑页');

  const mismatchDetails = () => {
    const actual = normalize(bodyText());
    let offset = 0;
    while (offset < Math.min(expected.length, actual.length) && actual[offset] === expected[offset]) offset++;
    return '（预览 ' + expected.length + ' 字符，编辑器 ' + actual.length + ' 字符，首处差异在第 ' + (offset + 1) + ' 字符）';
  };
  let bodyError = await writeBody() ? '' : '正文与预览不一致，已暂停插图' + mismatchDetails();
  const failedImages = [];
  let offset = 0;
  for (const [index, image] of images.entries()) {
    if (bodyError) break;
    offset += normalize(parts[index]).length;
    const boundary = locateBoundary(offset);
    if (!boundary) {
      failedImages.push((index + 1) + '（未找到段落边界）');
      continue;
    }
    try {
      if (!await insertImage(image, offset)) throw Error('未确认图片已插入');
    } catch (error) {
      failedImages.push((index + 1) + '（' + error.message + '）');
    }
    editor = getEditor();
    if (!editor || !matchesBody()) {
      if (editor && !imageDrawer() && await clearBody() && await writeBody()) {
        bodyError = '插图时检测到正文变化，已恢复完整正文，请检查后补插图片';
      } else {
        bodyError = '插图时检测到正文变化，已停止后续插图，请核对';
      }
    }
  }
  const label = [...document.querySelectorAll('label')].find(node =>
    node.textContent.replace(/\s+/g, '') === '个人观点，仅供参考');
  const checkbox = label?.querySelector('input[type="checkbox"]');
  if (checkbox && !checkbox.checked && !checkbox.disabled) label.click();
  await pause(100);
  if (!titleMatches()) await writeTitle();
  editor = getEditor();
  if (!bodyError && (!editor || normalize(bodyText()) !== normalize(expected))) {
    bodyError = '正文已写入，但与预览回读不一致，请核对正文';
  }
  const finalImageCount = editor ? uploadedImageCount() : 0;
  const messages = [titleMatches() ? '标题已填写' : '标题未确认，请核对页面',
    bodyError || '正文已填写',
    checkbox?.checked ? '已勾选个人观点，仅供参考' : '请手动检查作品声明'];
  if (images.length) {
    messages.push('通过编辑器本地上传，正文已确认 ' + finalImageCount + '/' + images.length + ' 张图片' +
      (failedImages.length ? '，上传未确认：' + failedImages.join('、') : ''));
  }
  return { message: messages.join('\n') };
}
