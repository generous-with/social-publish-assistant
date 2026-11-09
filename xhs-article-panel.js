(() => {
  if (location.origin !== 'https://creator.xiaohongshu.com' || location.pathname !== '/publish/publish' ||
      new URLSearchParams(location.search).get('target') !== 'article') return;
  document.getElementById('social-publish-assistant-panel')?.style.setProperty('display', 'none', 'important');
  const id = 'social-publish-xhs-article-panel';
  const existing = document.getElementById(id);
  if (existing && globalThis.__socialPublishXhsArticlePanel === existing) {
    existing.style.removeProperty('display');
    return;
  }
  existing?.remove();
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = 'all:initial;position:fixed!important;top:24px!important;right:16px!important;z-index:2147483647!important';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    section{box-sizing:border-box;background:#fff;color:#202332;width:min(430px,calc(100vw - 32px));max-height:calc(100vh - 48px);overflow:auto;padding:16px;border:1px solid #ccd0d8;border-radius:12px;box-shadow:0 8px 40px #0004;font:14px/1.5 system-ui}
    h2{margin:0 0 12px} label{display:block;margin:8px 0} input[type=file]{display:block;max-width:100%}
    input[type=text],textarea{box-sizing:border-box;width:100%;padding:6px;font:inherit}
    #status{white-space:pre-wrap;overflow-wrap:anywhere} #close{float:right} small{display:block}
    </style><section aria-label="小红书长文助手">
    <button id="close" aria-label="关闭">×</button><h2>小红书长文助手 1.9.24</h2>
    <label>多平台标题 TXT <input id="copy" type="file" accept=".txt,text/plain"></label>
    <small id="copySource"></small>
    <label>长文文件（可选，也可直接粘贴正文） <input id="article" type="file" accept=".md,.markdown,.txt,text/plain,text/markdown"></label>
    <label>长文标题 <input id="title" type="text"></label>
    <label>长文正文（支持 Markdown） <textarea id="body" rows="6"></textarea></label>
    <label>排版页配图 <input id="layoutImage" type="file" accept="image/jpeg,image/png,image/webp"></label>
    <label>图片编辑首图（4:3） <input id="firstImage" type="file" accept="image/jpeg,image/png,image/webp"></label>
    <label>发布描述 <textarea id="description" rows="3"></textarea></label>
    <label>话题 <textarea id="tags" rows="2"></textarea></label>
    <label><input id="overwrite" type="checkbox">替换页面已有文案</label>
    <label><input id="original" type="checkbox" checked>开启原创声明并确认平台协议</label>
    <button id="fill">填写长文并排版</button><p id="status" role="status">请选择文案和两张图片，检查后开始填写。</p>
    <small>助手完成填写后，请检查排版、首图、话题和原创声明，再手动发布。</small></section>`;
  document.documentElement.appendChild(host);
  globalThis.__socialPublishXhsArticlePanel = host;
  const get = key => root.getElementById(key);
  const status = text => { get('status').textContent = text; };
  const markdown = markdownit({ html: false, linkify: false });
  markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);
  const sharedKey = 'shared-source-file';
  let progress = {};
  let importing = false;
  let busy = false;
  get('close').onclick = () => host.style.setProperty('display', 'none', 'important');
  for (const field of ['title', 'body', 'article', 'layoutImage']) {
    get(field).addEventListener('change', () => { progress = {}; });
  }
  get('firstImage').onchange = () => { delete progress.firstSource; };
  async function readText(file) {
    if (file.size > 2 * 1024 * 1024) throw Error('文本文件不能超过 2 MB');
    const bytes = await file.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return new TextDecoder('gb18030', { fatal: true }).decode(bytes); }
  }
  function applyCopy(text, name) {
    const data = DouyinText.parse(text, '小红书');
    if (!get('title').value) get('title').value = data.title;
    get('description').value = data.description;
    get('tags').value = data.tags.map(tag => '#' + tag).join(' ');
    get('copySource').textContent = '已读取 ' + name + ' 中的【小红书】文案';
  }
  chrome.storage.local.get(sharedKey).then(result => {
    const shared = result[sharedKey];
    if (shared?.text && !importing && !busy && !get('copy').files.length && !get('description').value) {
      try { applyCopy(shared.text, shared.name); }
      catch { get('copySource').textContent = '上次选择的文件没有可用的【小红书】文案，请重新选择。'; }
    }
  }).catch(() => {});
  get('copy').onchange = async () => {
    const file = get('copy').files[0];
    if (!file) return;
    importing = true;
    get('fill').disabled = true;
    get('copy').disabled = true;
    get('description').value = '';
    get('tags').value = '';
    get('copySource').textContent = '';
    try {
      const text = await readText(file);
      applyCopy(text, file.name);
      await chrome.storage.local.set({ [sharedKey]: { id: crypto.randomUUID(), name: file.name, text } });
      status('已读取发布描述和话题，请检查文案。');
    } catch (error) { status(error.message); }
    finally { importing = false; get('fill').disabled = false; get('copy').disabled = false; }
  };
  get('article').onchange = async () => {
    const file = get('article').files[0];
    if (!file) return;
    for (const field of ['article', 'fill', 'copy']) get(field).disabled = true;
    try {
      let text = (await readText(file)).trim();
      const heading = text.match(/^#\s+(.+)\r?\n/);
      if (heading) {
        get('title').value = heading[1].trim();
        text = text.slice(heading[0].length).trim();
      }
      get('body').value = text;
      status('长文已读取，请检查标题和正文。');
    } catch (error) { status(error.message); }
    finally { for (const field of ['article', 'fill', 'copy']) get(field).disabled = importing; }
  };
  async function validateImage(id, label, ratio) {
    const file = get(id).files[0];
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw Error('请选择 JPEG、PNG 或 WebP 格式的' + label);
    }
    if (!file.size || file.size > 10 * 1024 * 1024) throw Error(label + '须在 10 MB 以内');
    if (!ratio) return;
    const bitmap = await createImageBitmap(file);
    try {
      if (Math.abs(bitmap.width / bitmap.height / ratio - 1) > 0.01) {
        throw Error(label + '必须为 4:3，当前图片是 ' + bitmap.width + '×' + bitmap.height);
      }
    } finally { bitmap.close(); }
  }
  get('fill').onclick = async () => {
    const title = get('title').value.trim();
    const description = get('description').value.trim();
    const tags = DouyinText.splitTags(get('tags').value, '小红书');
    const bodyHtml = markdown.render(get('body').value.trim());
    const parsed = new DOMParser().parseFromString(bodyHtml, 'text/html');
    const bodyText = parsed.body.textContent;
    if (!title || !bodyText.trim()) return status('请填写长文标题和正文。');
    try { DouyinText.validate({ title: '长文', description, tags }, '小红书'); }
    catch (error) { return status('发布描述或话题需要检查。' + error.message); }
    const inputs = [...root.querySelectorAll('input,textarea,button')];
    inputs.forEach(input => { input.disabled = true; });
    busy = true;
    status('正在排版并上传两张图片。请保持当前页面打开，等待填写结果。');
    try {
      await Promise.all([
        validateImage('layoutImage', '排版配图'), validateImage('firstImage', '首图', 4 / 3)
      ]);
      const result = await chrome.runtime.sendMessage({ type: 'social-publish-fill-xhs-article', data: {
        title, bodyHtml, bodyText, description, tags, progress,
        overwrite: get('overwrite').checked, original: get('original').checked
      } });
      if (result?.progress) progress = result.progress;
      status(result?.message || '扩展后台未返回结果。请在扩展管理页重新加载扩展，再刷新长文页。');
    } catch (error) { status(error.message); }
    finally { busy = false; inputs.forEach(input => { input.disabled = false; }); }
  };
})();
