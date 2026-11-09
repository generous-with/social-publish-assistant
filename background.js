importScripts('platform-fill.js','bili-fill.js','bili-clear.js','xhs-fill.js','xhs-article-fill.js','zhihu-fill.js','youtube-fill.js','facebook-fill.js','x-fill.js','article-fill.js','zhihu-article-fill.js','toutiao-video-settings.js','douyin-declaration.js');
const isArticle=url=>{try{const u=new URL(url);return u.origin==='https://mp.toutiao.com'&&u.pathname==='/profile_v4/graphic/publish';}catch{return false;}};
const isZhihuArticle=url=>{try{const u=new URL(url);return u.origin==='https://zhuanlan.zhihu.com'&&/^\/(?:write|p\/\d+\/edit)\/?$/.test(u.pathname);}catch{return false;}};
const isXhsArticle=url=>{try{const u=new URL(url);return u.origin==='https://creator.xiaohongshu.com'&&u.pathname==='/publish/publish'&&u.searchParams.get('target')==='article';}catch{return false;}};
const isEditor=url=>{try{const u=new URL(url);return (u.origin==='https://creator.douyin.com'&&u.pathname==='/creator-micro/content/post/video')||(u.origin==='https://mp.toutiao.com'&&u.pathname==='/profile_v4/xigua/upload-video')||(u.origin==='https://member.bilibili.com'&&u.pathname.startsWith('/platform/upload/video'))||(u.origin==='https://creator.xiaohongshu.com'&&u.pathname==='/publish/publish'&&u.searchParams.get('target')==='video')||(u.origin==='https://www.zhihu.com'&&u.pathname==='/upload-video')||(u.origin==='https://studio.youtube.com'&&/^\/channel\/[^/]+\/videos(?:\/upload)?\/?$/.test(u.pathname))||(u.origin==='https://www.facebook.com'&&/^\/post\/create\/?$/.test(u.pathname))||(['https://x.com','https://www.x.com'].includes(u.origin)&&/^\/(?:home|compose\/(?:post|tweet))\/?$/.test(u.pathname));}catch{return false;}};
async function openPanel(tab){if(!tab.id)return;try{if(!isArticle(tab.url)&&!isZhihuArticle(tab.url)&&!isXhsArticle(tab.url)&&!isEditor(tab.url))throw Error('请先切换到已支持平台的发布页面，再点击图标');await chrome.action.setBadgeText({tabId:tab.id,text:'…'});await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',files:(isArticle(tab.url)||isZhihuArticle(tab.url))?['markdown-it.min.js','article-markdown.js','article-panel.js']:isXhsArticle(tab.url)?['markdown-it.min.js','parser.js','xhs-article-panel.js']:['parser.js','panel.js']});await chrome.action.setBadgeText({tabId:tab.id,text:''});await chrome.action.setTitle({tabId:tab.id,title:'社交发布助手'});}catch(error){await chrome.action.setBadgeText({tabId:tab.id,text:'!'});await chrome.action.setTitle({tabId:tab.id,title:error.message||String(error)});}}
chrome.action.onClicked.addListener(openPanel);
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
if(message?.type==='social-publish-fill-zhihu-article'){
  if(!sender.tab?.id||sender.frameId!==0||!isZhihuArticle(sender.url)){
    respond({ok:false,message:'请打开知乎专栏文章编辑页'});
    return;
  }
  Promise.resolve().then(()=>chrome.scripting.executeScript({
    target:{tabId:sender.tab.id},world:'MAIN',func:fillZhihuArticle,args:[message.data]
  })).then(([entry])=>respond(entry?.result||{ok:false,message:'未收到知乎文章填写结果'}))
    .catch(error=>respond({ok:false,message:error.message}));
  return true;
}
if(message?.type==='social-publish-fill-xhs-article'){
  if(!sender.tab?.id||sender.frameId!==0||!isXhsArticle(sender.url)){
    respond({ok:false,message:'请打开小红书「写长文」'});
    return;
  }
  const data=message.data;
  const target={tabId:sender.tab.id};
  Promise.resolve().then(()=>chrome.scripting.executeScript({target,world:'MAIN',func:prepareXhsArticle,args:[data]})).then(async ([entry])=>{
    const prepared=entry?.result;
    if(!prepared?.ok&&!prepared?.detailsReady)return respond(prepared||{ok:false,message:'未收到长文排版结果'});
    try{
      const copy={description:data.description,tags:data.tags,original:data.original};
      const [filled]=await chrome.scripting.executeScript({target,world:'MAIN',func:fillXhs,args:[copy,Boolean(data.overwrite),'article']});
      const result=filled?.result||{ok:false,message:'未收到发布描述填写结果'};
      respond({...result,ok:prepared.ok&&result.ok,progress:prepared.progress,message:prepared.message+'\n'+result.message});
    }catch(error){
      respond({...prepared,ok:false,message:prepared.message+'\n发布描述填写失败：'+error.message});
    }
  }).catch(error=>respond({ok:false,message:error.message}));
  return true;
}
if(message?.type==='social-publish-fill-article'){
  if(!sender.tab?.id||sender.frameId!==0||!isArticle(sender.url)){
    respond({message:'请打开今日头条文章编辑页'});
    return;
  }
  chrome.scripting.executeScript({
    target:{tabId:sender.tab.id}, world:'MAIN', func:fillToutiaoArticle, args:[message.data]
  }).then(results=>respond(results[0]?.result||{message:'文章填写未收到结果，请检查当前页面'}))
    .catch(error=>respond({message:error.message}));
  return true;
}
if(message?.type==='social-publish-clear-bili-tags'){if(!sender.tab?.id||!sender.url?.startsWith('https://member.bilibili.com/platform/upload/video')){respond({ok:false,message:'请打开B站投稿页'});return;}chrome.scripting.executeScript({target:{tabId:sender.tab.id},world:'MAIN',func:clearBiliTags}).then(r=>respond(r[0]?.result||{ok:false,message:'未收到清理结果'})).catch(e=>respond({ok:false,message:e.message}));return true;}if(message?.type!=='social-publish-fill')return;if(!sender.tab?.id||!isEditor(sender.url)){respond({ok:false,message:'仅支持已适配平台的发布页面'});return;}chrome.scripting.executeScript({target:{tabId:sender.tab.id},world:'MAIN',func:new URL(sender.url).origin==='https://member.bilibili.com'?fillBili:new URL(sender.url).origin==='https://creator.xiaohongshu.com'?fillXhs:new URL(sender.url).origin==='https://www.zhihu.com'?fillZhihu:new URL(sender.url).origin==='https://studio.youtube.com'?fillYouTube:new URL(sender.url).origin==='https://www.facebook.com'?fillFacebook:['https://x.com','https://www.x.com'].includes(new URL(sender.url).origin)?fillX:fillPlatform,args:[message.data,Boolean(message.overwrite)]}).then(async results=>{
  const result=results[0]?.result||{ok:false,message:'页面未返回结果'};
  const url=new URL(sender.url);
  const isToutiaoVideo=url.origin==='https://mp.toutiao.com'&&url.pathname==='/profile_v4/xigua/upload-video';
  let configure, settingsLabel;
  if(isToutiaoVideo){
    configure=fillToutiaoVideoSettings;
    settingsLabel='头条视频设置';
  }else if(url.origin==='https://creator.douyin.com'&&url.pathname==='/creator-micro/content/post/video'){
    configure=fillDouyinDeclaration;
    settingsLabel='自主声明';
  }
  if(configure&&(result.ok||isToutiaoVideo)){
    try{
      const [settings]=await chrome.scripting.executeScript({
        target:{tabId:sender.tab.id},world:'ISOLATED',func:configure
      });
      result.message+='\n'+(settings?.result||'请核对'+settingsLabel);
    }catch(error){result.message+='\n'+settingsLabel+'待核对：'+error.message;}
  }
  respond(result);
}).catch(error=>respond({ok:false,message:error.message}));return true;});
