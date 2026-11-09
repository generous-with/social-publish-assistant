(() => {
  const zhihu = location.origin === 'https://zhuanlan.zhihu.com' && /^\/(?:write|p\/\d+\/edit)\/?$/.test(location.pathname);
  if (!zhihu && (location.origin !== 'https://mp.toutiao.com' || location.pathname !== '/profile_v4/graphic/publish')) return;
  document.getElementById('social-publish-assistant-panel')?.style.setProperty('display', 'none', 'important');
  const id = 'social-publish-article-panel';
  const existing = document.getElementById(id);
  if (existing && globalThis.__socialPublishArticlePanel === existing) {
    existing.style.removeProperty('display');
    return;
  }
  existing?.remove();
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = 'all:initial;position:fixed!important;top:24px!important;right:16px!important;z-index:2147483647!important';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    section{box-sizing:border-box;background:white;color:#202332;width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;padding:18px;border:1px solid #ccd0d8;border-radius:12px;box-shadow:0 8px 40px #0004;font:14px/1.65 system-ui}
    label{display:block;margin:8px 0} input[type=text]{box-sizing:border-box;width:100%;padding:6px}
    #preview{max-height:42vh;overflow:auto;border:1px solid #ccd0d8;padding:12px;overflow-wrap:anywhere}
    img{max-width:100%;height:auto} pre{overflow:auto;background:#f3f5f8;padding:8px} table{border-collapse:collapse} th,td{border:1px solid #ccd0d8;padding:4px} #status{white-space:pre-wrap} #close{float:right}
    </style><section aria-label="${zhihu ? '知乎文章助手' : '头条文章助手'}"><button id="close" aria-label="关闭">×</button>
    <h2>${zhihu ? '知乎' : '头条'}文章发布助手 1.9.24</h2><label>Markdown 文章 <input id="article" type="file" accept=".md,.markdown,text/markdown"></label>
    <label>正文配图（可选，选三张 ${zhihu ? '' : '16:9 '}JPEG / PNG）<input id="images" type="file" accept="image/jpeg,image/png" multiple></label>
    ${zhihu ? '<label>文章封面（必选，16:9 JPEG / PNG）<input id="cover" type="file" accept="image/jpeg,image/png"></label><img id="coverPreview" alt="封面预览" hidden style="max-height:100px">' : ''}
    <label>文章标题 <input id="title" type="text"></label><div id="preview" aria-label="正文预览"></div>
    <label><input type="checkbox" id="overwrite">替换页面已有文案</label>
    <button id="fill" disabled>填写文章</button>
    ${zhihu ? '<button id="settings">仅应用发布设置</button><small>填写或应用设置会选择「包含剧透」并开启送礼物。知乎首次确认开启时即接受《知乎赞赏功能使用协议》。</small>' : ''}
    <p id="status" role="status">请选择 Markdown 文件，预览后填写。</p>
    <small>填写后请检查正文、${zhihu ? '配图和封面' : '图片和作品声明'}，再手动发布。</small></section>`;
  document.documentElement.appendChild(host);
  globalThis.__socialPublishArticlePanel = host;
  const get = id => root.getElementById(id);
  const status = message => { get('status').textContent = message; };
  let markdown = '', article, pictures = [], revision = 0, objectUrls = [];
  let cover, coverUrl;
  let settingsRunning = false;
  const updateFill = () => { get('fill').disabled = !article || (zhihu && (!cover || settingsRunning)); };
  const revoke = () => { for (const url of objectUrls) URL.revokeObjectURL(url); objectUrls = []; };
  get('close').onclick = () => { host.style.setProperty('display', 'none', 'important'); };
  function preview() {
    const prepared = prepareToutiaoArticle(markdown, markdownit, pictures.length === 3, zhihu);
    revoke();
    get('preview').replaceChildren();
    prepared.sections.forEach((html, index) => {
      const block = document.createElement('div');
      block.innerHTML = html;
      get('preview').append(block);
      if (pictures[index]) {
        const image = document.createElement('img');
        const url = URL.createObjectURL(pictures[index]);
        objectUrls.push(url);
        image.src = url;
        image.alt = pictures[index].name;
        get('preview').append(image);
      }
    });
    return prepared;
  }
  get('article').onchange = async () => {
    const file = get('article').files[0];
    if (!file) return;
    const current = ++revision;
    get('fill').disabled = true;
    get('images').disabled = true;
    article = undefined;
    get('title').value = '';
    get('preview').replaceChildren();
    revoke();
    try {
      if (file.size > 2 * 1024 * 1024) throw Error('Markdown 文件不能超过 2 MB');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (current !== revision) return;
      markdown = text;
      article = preview();
      get('title').value = article.title;
      status(zhihu ? (cover ? '正文和封面已就绪，请检查预览。' : '正文预览已生成。请选择 16:9 封面。') :
        '预览已生成。填写时将勾选个人观点，仅供参考。');
    } catch (error) { if (current === revision) status(error.message); }
    finally { if (current === revision) { get('images').disabled = false; updateFill(); } }
  };
  async function preparePicture(file) {
    const maxBytes = 5 * 1024 * 1024;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      throw Error(file.name + '：请选择 PNG 或 JPEG 图片');
    }
    let bitmap;
    try { bitmap = await createImageBitmap(file); }
    catch { throw Error(file.name + '：图片无法读取'); }
    try {
      if (Math.abs((bitmap.width / bitmap.height) / (16 / 9) - 1) > 0.01) {
        throw Error(file.name + ' 的宽高比不是 16:9');
      }
      if (file.size <= maxBytes) return file;

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw Error(file.name + '：浏览器无法压缩图片');
      let scale = Math.min(1, 4096 / bitmap.width);
      try {
        for (let pass = 0; pass < 4; pass++, scale *= 0.8) {
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          for (const quality of [0.94, 0.86, 0.76]) {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
            if (blob?.type === 'image/jpeg' && blob.size > 0 && blob.size <= maxBytes) {
              return new File([blob], file.name.replace(/\.(png|jpe?g)$/i, '') + '.jpg', { type: blob.type });
            }
          }
        }
      } finally {
        canvas.width = canvas.height = 0;
      }
      throw Error(file.name + '：自动压缩后仍超过 5 MB');
    } finally { bitmap.close(); }
  }

  get('images').onchange = async () => {
    const current = ++revision;
    const files = [...get('images').files];
    get('fill').disabled = true;
    pictures = [];
    try {
      if (files.length && files.length !== 3) throw Error('请选择恰好三张图片');
      const prepared = [];
      for (const file of files) {
        status('正在准备配图 ' + (prepared.length + 1) + '/3…');
        const picture = zhihu ? file : await preparePicture(file);
        if (current !== revision) return;
        prepared.push(picture);
      }
      pictures = prepared;
      const compressed = prepared.filter((picture, index) => picture !== files[index]).length;
      status(files.length ? '已按文件列表顺序安排三张正文配图。' +
        (compressed ? '其中 ' + compressed + ' 张超大图片已自动压缩为 JPEG。' : '') : '已移除配图。');
    } catch (error) {
      if (current !== revision) return;
      get('images').value = '';
      status(error.message);
    } finally {
      if (current === revision) {
        if (article) article = preview();
        updateFill();
      }
    }
  };
  if (zhihu) get('cover').onchange = async () => {
    const input = get('cover');
    const file = input.files[0];
    cover = undefined;
    get('fill').disabled = true;
    const image = get('coverPreview');
    image.hidden = true;
    image.removeAttribute('src');
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    coverUrl = undefined;
    if (!file) return;
    input.disabled = true;
    try {
      if (!['image/png', 'image/jpeg'].includes(file.type)) throw Error('封面请选择 JPEG 或 PNG 图片');
      const bitmap = await createImageBitmap(file);
      try {
        if (Math.abs(bitmap.width / bitmap.height / (16 / 9) - 1) > 0.01) {
          throw Error('封面必须为 16:9，当前图片是 ' + bitmap.width + '×' + bitmap.height);
        }
      } finally { bitmap.close(); }
      cover = file;
      image.src = coverUrl = URL.createObjectURL(file);
      image.hidden = false;
      status('已选择 16:9 封面。');
    } catch (error) { input.value = ''; status(error.message); }
    finally { input.disabled = false; updateFill(); }
  };
  get('fill').onclick = async () => {
    if (!article || (zhihu && !cover)) return;
    const title = get('title').value.trim();
    if (title.length < 2) return status('标题至少需要两个字符');
    const fields = ['article', 'images', 'fill', 'close', ...(zhihu ? ['cover', 'settings'] : [])];
    for (const id of fields) get(id).disabled = true;
    status('正在填写文章。上传配图时请保持页面打开。');
    try {
      const images = zhihu ? undefined : await Promise.all(pictures.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(Error('读取图片失败：' + file.name));
        reader.onload = () => resolve({ name: file.name, type: file.type, base64: reader.result.split(',')[1] });
        reader.readAsDataURL(file);
      })));
      const result = await chrome.runtime.sendMessage({
        type: zhihu ? 'social-publish-fill-zhihu-article' : 'social-publish-fill-article',
        data: { title, sections: article.sections, images, imageCount: pictures.length, overwrite: get('overwrite').checked }
      });
      status(result?.message || '未收到填写结果，请重新打开助手');
    } catch (error) { status(error.message); }
    finally { for (const id of fields) get(id).disabled = false; updateFill(); }
  };
  if (zhihu) get('settings').onclick = async () => {
    settingsRunning = true;
    get('settings').disabled = true;
    updateFill();
    status('正在应用知乎发布设置…');
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'social-publish-fill-zhihu-article',
        data: { settingsOnly: true }
      });
      status(result?.message || '未收到发布设置结果，请重新打开助手。');
    } catch (error) { status(error.message); }
    finally { settingsRunning = false; get('settings').disabled = false; updateFill(); }
  };
})();
