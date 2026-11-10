// One route owns its panel and its allowed commands. Adapters passed to run()
// must be self-contained because Chrome serializes their functions.
const publishing = (() => {
  const fill = 'social-publish-fill';
  const article = 'social-publish-fill-article';
  const zhihuArticle = 'social-publish-fill-zhihu-article';
  const xhsArticle = 'social-publish-fill-xhs-article';
  const clearTags = 'social-publish-clear-bili-tags';
  const textPanel = ['parser.js', 'panel.js'];
  const articlePanel = ['markdown-it.min.js', 'article-markdown.js', 'article-panel.js'];
  const errors = new Map([
    [fill, '仅支持已适配平台的发布页面'],
    [article, '请打开今日头条文章编辑页'],
    [zhihuArticle, '请打开知乎专栏文章编辑页'],
    [xhsArticle, '请打开小红书「写长文」'],
    [clearTags, '请打开B站投稿页'],
  ]);
  const fields = adapter => async (run, message) =>
    await run(adapter(), [message.data, Boolean(message.overwrite)]) ||
      { ok: false, message: '页面未返回结果' };
  const withSettings = (adapter, configure, label, runAfterFailure = false) => async (run, message) => {
    const result = await fields(adapter)(run, message);
    if (!result.ok && !runAfterFailure) return result;
    try {
      const status = await run(configure(), [], 'ISOLATED');
      return { ...result, message: result.message + '\n' + (status || '请核对' + label) };
    } catch (error) {
      return { ...result, message: result.message + '\n' + label + '待核对：' + error.message };
    }
  };
  const markdown = (adapter, fallback) => async (run, message) =>
    await run(adapter(), [message.data]) || { ok: false, message: fallback };
  async function fillXhsArticle(run, { data }) {
    const prepared = await run(prepareXhsArticle, [data]);
    if (!prepared?.ok && !prepared?.detailsReady) {
      return prepared || { ok: false, message: '未收到长文排版结果' };
    }
    try {
      const copy = { description: data.description, tags: data.tags, original: data.original };
      const result = await run(fillXhs, [copy, Boolean(data.overwrite), 'article']) ||
        { ok: false, message: '未收到发布描述填写结果' };
      return { ...result, ok: prepared.ok && result.ok, progress: prepared.progress,
        message: prepared.message + '\n' + result.message };
    } catch (error) {
      return { ...prepared, ok: false, message: prepared.message + '\n发布描述填写失败：' + error.message };
    }
  }
  const text = (origin, path, action) => ({ origin, path, panel: textPanel, commands: { [fill]: action } });
  const routes = [
    text('https://creator.douyin.com', '/creator-micro/content/post/video',
      withSettings(() => fillPlatform, () => fillDouyinDeclaration, '自主声明')),
    text('https://mp.toutiao.com', '/profile_v4/xigua/upload-video',
      withSettings(() => fillPlatform, () => fillToutiaoVideoSettings, '头条视频设置', true)),
    { origin: 'https://mp.toutiao.com', path: '/profile_v4/graphic/publish', panel: articlePanel,
      commands: { [article]: markdown(() => fillToutiaoArticle, '文章填写未收到结果，请检查当前页面') } },
    { origin: 'https://member.bilibili.com', path: /^\/platform\/upload\/video(?:\/|$)/, panel: textPanel,
      commands: { [fill]: fields(() => fillBili), [clearTags]: async run =>
        await run(clearBiliTags) || { ok: false, message: '未收到清理结果' } } },
    { ...text('https://creator.xiaohongshu.com', '/publish/publish', fields(() => fillXhs)), target: 'video' },
    { ...text('https://creator.xiaohongshu.com', '/publish/publish', fields(() => fillXhs)), target: null,
      checkPanel: async run => {
        const result = await run(fillXhs, [null, false, 'inspect-video'], 'ISOLATED');
        if (!result?.ok) throw Error(result?.message || '请先切换到小红书「上传视频」');
      } },
    { origin: 'https://creator.xiaohongshu.com', path: '/publish/publish', target: 'article',
      panel: ['markdown-it.min.js', 'parser.js', 'xhs-article-panel.js'], commands: { [xhsArticle]: fillXhsArticle } },
    text('https://www.zhihu.com', '/upload-video', fields(() => fillZhihu)),
    { origin: 'https://zhuanlan.zhihu.com', path: /^\/(?:write|p\/\d+\/edit)\/?$/, panel: articlePanel,
      commands: { [zhihuArticle]: markdown(() => fillZhihuArticle, '未收到知乎文章填写结果') } },
    text('https://studio.youtube.com', /^\/channel\/[^/]+\/videos(?:\/upload)?\/?$/, fields(() => fillYouTube)),
    text('https://www.facebook.com', /^\/post\/create\/?$/, fields(() => fillFacebook)),
    ...['https://x.com', 'https://www.x.com'].map(origin =>
      text(origin, /^\/(?:home|compose\/(?:post|tweet))\/?$/, fields(() => fillX))),
  ];
  const resolve = url => {
    try {
      const page = new URL(url);
      return routes.find(route => route.origin === page.origin &&
        (typeof route.path === 'string' ? route.path === page.pathname : route.path.test(page.pathname)) &&
        (!Object.hasOwn(route, 'target') || route.target === page.searchParams.get('target')));
    } catch { return undefined; }
  };
  return {
    panel: url => resolve(url)?.panel,
    checkPanel: (url, run) => resolve(url)?.checkPanel?.(run),
    command: (url, type) => resolve(url)?.commands[type],
    refusal: type => errors.get(type),
  };
})();
