importScripts('platform-fill.js','bili-fill.js','bili-clear.js','xhs-fill.js','xhs-article-fill.js','zhihu-fill.js','youtube-fill.js','facebook-fill.js','x-fill.js','article-fill.js','zhihu-article-fill.js','toutiao-video-settings.js','douyin-declaration.js','publishing-routes.js');

const runInTab = tabId => async (func, args = [], world = 'MAIN') => {
  const [entry] = await chrome.scripting.executeScript({ target: { tabId }, world, func, args });
  return entry?.result;
};

async function openPanel(tab) {
  if (!tab.id) return;
  try {
    const files = publishing.panel(tab.url);
    if (!files) throw Error('请先切换到已支持平台的发布页面，再点击图标');
    await chrome.action.setBadgeText({ tabId: tab.id, text: '…' });
    await publishing.checkPanel(tab.url, runInTab(tab.id));
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'ISOLATED', files });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    await chrome.action.setTitle({ tabId: tab.id, title: '社交发布助手' });
  } catch (error) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({ tabId: tab.id, title: error.message || String(error) });
  }
}

chrome.action.onClicked.addListener(openPanel);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const refusal = publishing.refusal(message?.type);
  if (!refusal) return;
  const action = publishing.command(sender.url, message.type);
  if (!sender.tab?.id || sender.frameId !== 0 || !action) {
    respond({ ok: false, message: refusal });
    return;
  }
  const run = runInTab(sender.tab.id);
  Promise.resolve().then(() => action(run, message)).then(respond, error =>
    respond({ ok: false, message: error.message || String(error) }));
  return true;
});
