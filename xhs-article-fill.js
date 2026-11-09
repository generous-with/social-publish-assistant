async function prepareXhsArticle(data) {
  const progress = { ...data.progress };
  const messages = [];
  let detailsReady = false;
  const fail = message => ({
    ok: false, progress, detailsReady: Boolean(detailsReady && onArticle() && imageList()),
    message: [...messages, message].join('\n')
  });
  const onArticle = () => location.origin === 'https://creator.xiaohongshu.com' &&
    location.pathname === '/publish/publish' && new URLSearchParams(location.search).get('target') === 'article';
  const visible = element => element.getClientRects().length && !element.closest('[aria-hidden="true"]');
  const one = (selector, root = document) => {
    const matches = [...root.querySelectorAll(selector)].filter(visible);
    return matches.length === 1 ? matches[0] : null;
  };
  const control = (selector, text, root = document) => {
    const matches = [...root.querySelectorAll(selector)].filter(element =>
      visible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true' &&
      element.textContent.trim() === text);
    return matches.length === 1 ? matches[0] : null;
  };
  const wait = async (lookup, message, timeout = 7000) => {
    const end = Date.now() + timeout;
    do {
      if (!onArticle()) throw Error('已离开小红书长文页');
      const value = lookup();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 120));
    } while (Date.now() < end);
    throw Error(message);
  };
  const normalized = text => text.replace(/[\s\u200b\ufeff]/g, '');
  const articleTitle = () => one('textarea[placeholder="输入标题"]');
  const articleEditor = () => one('.tiptap.ProseMirror[contenteditable="true"]');
  const cover = () => one('.edit-left [data-dom-type="cover"]');
  const coverImage = () => cover()?.style.backgroundImage || '';
  const compose = () => one('.edit-left') && control('button.submit', '下一步');
  const imageList = () => one('.img-list .flex-list');
  const imageCards = list => [...list.children].filter(card => card.hasAttribute('data-draggable'));
  const source = card => card?.querySelector('img.preview')?.getAttribute('src') || '';
  const loaded = card => {
    const image = card.querySelector('img.preview');
    return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  };
  const readyList = () => wait(() => {
    const list = imageList();
    const cards = list && imageCards(list);
    return cards?.length && cards.every(loaded) && list;
  }, '排版生成的图片尚未加载完成，请检查图片编辑区', 45000);
  const choosePhotoTemplate = async () => {
    one('.setting-button:not(.setting-button-hide)')?.click();
    const templates = await wait(() => control('.setting-panel .tab', '选择模板'), '未找到排版模板设置');
    templates.click();
    const template = await wait(() => control('.setting-panel .template-title', '理性现代'),
      '请手动选择有图模板');
    template.closest('.template-card').click();
    await wait(cover, '切换模板后未显示排版配图区域', 15000);
  };
  async function readBitmap(url) {
    const response = await fetch(url, { cache: 'force-cache', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw Error('无法读取小红书生成的图片，暂未确认排版配图');
    return createImageBitmap(await response.blob());
  }
  async function coverSample() {
    const element = cover();
    const card = element?.closest('.cover-container');
    const box = element?.getBoundingClientRect();
    const frame = card?.getBoundingClientRect();
    const url = coverImage().match(/^url\(["']?(.*?)["']?\)$/)?.[1];
    if (!url || !frame?.width || !frame.height || !box?.width || !box.height) {
      throw Error('未找到可校验的排版配图，请检查预览');
    }
    const style = getComputedStyle(element);
    const image = await readBitmap(url);
    try {
      const position = style.backgroundPosition.split(/\s+/).map(value => value.endsWith('%') ? parseFloat(value) / 100 : 0.5);
      const factor = (style.backgroundSize === 'contain' ? Math.min : Math.max)(
        box.width / image.width, box.height / image.height);
      const width = image.width * factor, height = image.height * factor;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 24;
      const context = canvas.getContext('2d');
      context.scale(24 / box.width, 24 / box.height);
      context.drawImage(image, (box.width - width) * position[0],
        (box.height - height) * (position[1] ?? 0.5), width, height);
      return {
        pixels: [...context.getImageData(0, 0, 24, 24).data],
        rect: [(box.left - frame.left) / frame.width, (box.top - frame.top) / frame.height,
          box.width / frame.width, box.height / frame.height]
      };
    } finally { image.close(); }
  }
  async function containsLayoutPhoto(url, sample) {
    const image = await readBitmap(url);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 24;
      const context = canvas.getContext('2d');
      const [left, top, width, height] = sample.rect;
      context.drawImage(image, left * image.width, top * image.height,
        width * image.width, height * image.height, 0, 0, 24, 24);
      const actual = context.getImageData(0, 0, 24, 24).data;
      let similar = 0, tested = 0;
      for (let index = 0; index < actual.length; index += 4) {
        if (sample.pixels[index + 3] < 240) continue;
        tested++;
        const [red, green, blue] = sample.pixels.slice(index, index + 3);
        const expected = red + green + blue;
        const observed = actual[index] + actual[index + 1] + actual[index + 2];
        // The layout template can add a translucent dark gradient and title text.
        const shade = Math.max(0.56, Math.min(1.12, observed / Math.max(1, expected)));
        if (Math.abs(actual[index] - red * shade) < 30 &&
            Math.abs(actual[index + 1] - green * shade) < 30 &&
            Math.abs(actual[index + 2] - blue * shade) < 30) similar++;
      }
      return tested > 100 && similar / tested >= 0.55;
    } finally { image.close(); }
  }
  const imageFile = (id, label) => {
    // The panel and the page share the same file inputs across Chrome's two script worlds.
    const root = document.getElementById('social-publish-xhs-article-panel')?.shadowRoot;
    const file = root?.getElementById(id)?.files?.[0];
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      throw Error('请选择' + label);
    }
    if (!file.size || file.size > 10 * 1024 * 1024) throw Error(label + '须在 10 MB 以内');
    return file;
  };
  function supply(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  try {
    if (!onArticle()) return fail('请先切换到小红书「写长文」');
    const title = data.title?.trim();
    const expectedBody = normalized(data.bodyText || '');
    if (!title || !expectedBody || !data.bodyHtml) return fail('请填写长文标题和正文');
    const layoutFile = imageFile('layoutImage', '排版配图');
    const firstFile = imageFile('firstImage', '4:3 首图');

    if (!imageList() && !compose()) {
      if (!articleTitle()) {
        const newArticle = control('button', '新的创作');
        if (!newArticle) return fail('请打开小红书「写长文」编辑器');
        newArticle.click();
      }
      const field = await wait(articleTitle, '未找到长文标题框');
      const body = await wait(articleEditor, '未找到长文正文编辑器');
      const currentBody = normalized(body.textContent);
      if (!data.overwrite && ((field.value.trim() && field.value.trim() !== title) ||
        (currentBody && currentBody !== expectedBody))) {
        return fail('页面已有不同的长文，请检查后勾选替换');
      }
      if (field.maxLength > 0 && title.length > field.maxLength) {
        return fail('长文标题超过编辑器允许的 ' + field.maxLength + ' 个字符');
      }
      if (field.value !== title) {
        field.focus();
        field.select();
        document.execCommand('insertText', false, title);
        field.blur();
      }
      if (currentBody !== expectedBody) {
        body.focus();
        const range = document.createRange();
        range.selectNodeContents(body);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        const clipboard = new DataTransfer();
        clipboard.setData('text/html', data.bodyHtml);
        clipboard.setData('text/plain', data.bodyText);
        body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
      }
      await wait(() => articleTitle()?.value === title &&
        normalized(articleEditor()?.textContent || '') === expectedBody,
      '标题或正文回读与预览不一致，已停在长文编辑页', 2000);
      progress.title = title;
      messages.push('长文标题和正文已填写');
      const layout = await wait(() => control('button.next-btn', '一键排版'), '未找到「一键排版」');
      layout.click();
      await wait(compose, '一键排版尚未进入预览，请检查页面后重试', 45000);
    }

    const generateLayout = async forcePhotoTemplate => {
      const preview = one('.edit-left');
      if (!normalized(preview?.textContent || '').includes(normalized(title))) {
        throw Error('当前排版页无法确认属于这篇长文，请返回正文编辑页再填写');
      }
      progress.title = title;
      if (forcePhotoTemplate || !cover()) {
        await choosePhotoTemplate();
        messages.push(forcePhotoTemplate ? '已切到「理性现代」重新生成配图' : '原模板无配图入口，已切换为「理性现代」');
      }
      if (!progress.layoutSource || coverImage() !== progress.layoutSource) {
        const previousImage = coverImage();
        const anchor = cover().parentElement;
        const bounds = anchor.getBoundingClientRect();
        for (const type of ['mouseenter', 'mouseover', 'mousemove']) {
          anchor.dispatchEvent(new MouseEvent(type, {
            bubbles: type !== 'mouseenter', view: window,
            clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2
          }));
        }
        const upload = await wait(() => control('.image-menu .menu-item', '从本地上传'),
          '未找到排版页「从本地上传」，请展开排版封面上的图片菜单');
        // The platform creates a detached file input synchronously for this one menu action.
        const prototype = HTMLInputElement.prototype;
        const originalClick = prototype.click;
        let input;
        prototype.click = function () {
          if (this.type === 'file' && !this.isConnected && this.accept.includes('image/png') && !input) {
            input = this;
            return;
          }
          return originalClick.call(this);
        };
        try { upload.click(); }
        finally { prototype.click = originalClick; }
        if (!input) throw Error('未取得排版页图片选择器');
        supply(input, layoutFile);
        progress.layoutSource = await wait(() => {
          const current = coverImage();
          return current && current !== previousImage && current;
        }, '未确认排版配图上传成功，请检查排版页', 45000);
      }
      messages.push('排版配图已上传');
      progress.layoutSample = await coverSample();
      const next = await wait(compose, '未找到排版页「下一步」');
      next.click();
      await wait(imageList, '尚未进入「图片编辑」，请检查排版页上的提示', 90000);
    };
    if (!imageList()) await generateLayout(false);

    if (progress.title !== title || !progress.layoutSource) {
      return fail('请从这篇长文的正文编辑页启动填写，或用本面板继续刚才的流程');
    }
    detailsReady = true;
    let list = await readyList();
    if (!progress.generatedSource || !imageCards(list).some(card => source(card) === progress.generatedSource)) {
      if (!progress.layoutSample) return fail('缺少排版预览，请返回排版页重新生成配图');
      const findLayoutCard = async () => {
        const candidate = source(imageCards(list)[0]);
        return await containsLayoutPhoto(candidate, progress.layoutSample) ? candidate : '';
      };
      progress.generatedSource = await findLayoutCard();
      if (!progress.generatedSource && !progress.firstSource) {
        const back = control('.publish-page-back-btn', '返回');
        if (back) {
          back.click();
          await wait(compose, '未能返回排版页，请手动返回并检查配图', 15000);
          await generateLayout(true);
          list = await readyList();
          progress.generatedSource = await findLayoutCard();
        }
      }
      if (!progress.generatedSource) {
        return fail('生成的排版图未确认带上配图。请返回排版页检查配图，再重新生成');
      }
    }
    if (!progress.firstSource || !imageCards(list).some(card => source(card) === progress.firstSource)) {
      const previous = new Set(imageCards(list).map(source).filter(Boolean));
      const input = list.closest('.img-list')?.querySelector('.top input[type="file"][multiple]');
      if (!input) return fail('未找到「图片编辑」的添加图片控件');
      supply(input, firstFile);
      progress.firstSource = await wait(() => {
        const current = imageList();
        const added = current && imageCards(current).filter(card => source(card) && !previous.has(source(card)));
        if (added?.length !== 1) return false;
        const image = added[0].querySelector('img.preview');
        return image.complete && image.naturalHeight &&
          Math.abs(image.naturalWidth / image.naturalHeight / (4 / 3) - 1) <= 0.01 && source(added[0]);
      }, '未确认「图片编辑」已添加 4:3 图片，请检查上传结果', 45000);
    }

    list = imageList();
    async function moveImage(url, index) {
      list = imageList();
      const cards = imageCards(list);
      const item = cards.find(card => source(card) === url);
      if (item && item === cards[index]) return;
      const key = Object.getOwnPropertyNames(list).find(name => /^Sortable\d+$/.test(name));
      const sortable = list[key];
      const start = sortable?.option?.('onStart');
      const update = sortable?.option?.('onUpdate');
      const end = sortable?.option?.('onEnd');
      if (!item || !cards[index] || [start, update, end].some(handler => typeof handler !== 'function')) {
        throw Error('请在「图片编辑」把 4:3 首图拖到第 1 张、排版配图拖到第 2 张');
      }
      // Send the same index information as the platform's Sortable drop callback.
      const children = [...list.children];
      const event = { item, from: list, to: list, oldIndex: children.indexOf(item),
        newIndex: children.indexOf(cards[index]), oldDraggableIndex: cards.indexOf(item), newDraggableIndex: index };
      start(event);
      try { update(event); }
      finally { end(event); }
      await wait(() => {
        const current = imageList();
        return current && source(imageCards(current)[index]) === url;
      }, '未确认图片移动到第 ' + (index + 1) + ' 张', 3000);
    }
    await moveImage(progress.firstSource, 0);
    await moveImage(progress.generatedSource, 1);
    messages.push('已确认第 1 张为 4:3 首图，第 2 张为带配图的排版成品');
    return { ok: true, progress, message: messages.join('\n') };
  } catch (error) {
    return fail(error.message);
  }
}
