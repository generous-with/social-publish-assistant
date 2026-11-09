(function(root){
function validate(d,platform='抖音'){if(['Facebook','X'].includes(platform)){if(!d.description?.trim())throw Error('未提取到抖音简介');if(d.description.length>1000)throw Error('抖音简介超过1000字');return;}if(!d.title?.trim()||!d.description?.trim())throw Error('标题或简介为空');if(d.title.length>(platform==='B站'?80:platform==='小红书'?20:platform==='知乎'||platform==='YouTube'?100:30)||d.description.length>(platform==='B站'?2000:platform==='今日头条'?400:platform==='知乎'?2000:platform==='YouTube'?5000:1000))throw Error('标题限'+(platform==='B站'?80:platform==='小红书'?20:platform==='知乎'||platform==='YouTube'?100:30)+'字，简介限'+(platform==='B站'?2000:platform==='今日头条'?400:platform==='知乎'?2000:platform==='YouTube'?5000:1000)+'字');if(platform==='小红书'&&d.description.length+(d.tags||[]).reduce((n,t)=>n+t.length+2,0)>1000)throw Error('小红书正文和话题合计超过1000字');if(platform==='B站'&&(d.dynamic||'').length>233)throw Error('粉丝动态超过233字');if(platform==='YouTube'&&(d.tags||[]).join(', ').length>500)throw Error('YouTube标签合计超过500字符');if(platform!=='YouTube'&&(d.tags||[]).length>(platform==='抖音'?20:10))throw Error('话题数量超过平台限制');}
function splitTags(s,platform){if(platform==='YouTube')return [...new Set(s.split(/[,，\n]+/).map(t=>t.trim().replace(/^#/, '')).filter(Boolean))];return [...new Set((s.match(/#[^\s#，,]+/g)||s.split(/[\s,，]+/)).map(t=>t.replace(/^#/, '').trim()).filter(Boolean))];}
function truncateImported(d,platform){
const titleLimit=platform==='B站'?80:platform==='小红书'?20:['知乎','YouTube'].includes(platform)?100:30;
const bodyLimit=platform==='B站'||platform==='知乎'?2000:platform==='今日头条'?400:platform==='YouTube'?5000:1000;
const notices=[];
function cut(key,label,limit){const value=d[key]||'';if(value.length<=limit)return;let end=Math.max(0,limit);if(end>0&&/[\uD800-\uDBFF]/.test(value[end-1]))end--;d[key]=value.slice(0,end);notices.push(label+'已从'+value.length+'截取为'+d[key].length+'字符');}
cut('title','标题',titleLimit);
const reserved=platform==='小红书'?(d.tags||[]).reduce((n,t)=>n+t.length+2,0):0;
cut('description','简介',Math.max(0,bodyLimit-reserved));
if(platform==='B站')cut('dynamic','粉丝动态',233);
if(notices.length)d.truncations=notices;
return d;
}
function platformSectionName(name){
  const compact=name.normalize('NFKC').replace(/[\s\u200b\ufeff]/g,'');
  const youtube=compact.replace(/\([^)]*\)$/,'');
  if(/^(youtube|油管)(?:视频|影片|平台|文案|发布文案)?$/i.test(youtube))return 'YouTube';
  return compact;
}
function sectionHeaders(text){
  const headers=[];
  for(const line of text.matchAll(/^[^\n]*$/gm)){
    const heading=line[0].trim().replace(/^#{1,6}\s+/,'').replace(/^\*\*|\*\*$/g,'').trim();
    const bracketed=heading.match(/^(?:【([^】]+)】|\[([^\]]+)\])/);
    const name=platformSectionName(bracketed?.[1]||bracketed?.[2]||heading.replace(/[：:]$/,''));
    if(bracketed?.[1]||name==='YouTube'||(bracketed?.[2]&&['今日头条','B站','抖音','小红书','知乎','Facebook','X'].includes(name))){
      headers.push({name,index:line.index,end:line.index+line[0].length});
    }
  }
  return headers;
}
function parse(text,platform='抖音'){if(!['抖音','今日头条','B站','小红书','知乎','YouTube','Facebook','X'].includes(platform))throw Error('不支持的平台');const sourcePlatform=['Facebook','X'].includes(platform)?'抖音':platform;text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');text=text.replace(/^([ \t]*)(主標題|標題|小標題|簡介|標籤|話題|粉絲動態)([：:])/gm,(_,space,key,colon)=>space+({'主標題':'主标题','標題':'标题','小標題':'小标题','簡介':'简介','標籤':'标签','話題':'话题','粉絲動態':'粉丝动态'}[key])+colon);const hs=sectionHeaders(text),ds=hs.filter(h=>h.name===sourcePlatform);
if(ds.length===0)throw Error('没有找到【'+sourcePlatform+'】段落，请检查是否选了包含该平台的多平台标题 TXT');
if(ds.length>1)throw Error('找到 '+ds.length+' 个【'+sourcePlatform+'】段落，请保留要填写的那一段');
const h=ds[0],next=hs.find(x=>x.index>h.index),s=text.slice(h.end,next?.index??text.length).split(/^\s*={3,}\s*$/m)[0];const fields=[...s.matchAll(/^\s*(主标题|标题|小标题|简介|正文|标签|话题|粉丝动态)[：:][ \t]*([^\n]*(?:\n(?!\s*(?:主标题|标题|小标题|简介|正文|标签|话题|粉丝动态)[：:])[^\n]*)*)/gm)];const get=names=>fields.filter(f=>names.includes(f[1]));const ts=get(['主标题','标题']),bs=get(platform==='知乎'?['简介','正文']:['简介']);if(!['Facebook','X'].includes(platform)&&ts.length!==1)throw Error('需要唯一的主标题（当前'+ts.length+'个）');if(bs.length!==1)throw Error('需要唯一的'+(platform==='知乎'?'简介或正文':'简介')+'（当前'+bs.length+'个）');const raw=bs[0][2].trim(),inline=raw.match(/#[^\s#，,]+/g)||[],separate=get(['标签','话题']).map(f=>f[2]).join(' ');const tags=splitTags(separate||inline.join(' '),platform);const d={title:['Facebook','X'].includes(platform)?'':ts[0][2].trim(),description:platform==='B站'||platform==='YouTube'||['Facebook','X'].includes(platform)?raw:raw.replace(/#[^\s#，,]+/g,'').trim(),tags:['Facebook','X'].includes(platform)?[]:tags};if(platform==='B站'){d.dynamic=get(['粉丝动态'])[0]?.[2].trim()||'';}truncateImported(d,platform);validate({...d,tags:[]},platform);return d;}
const api={parse,validate,splitTags};if(typeof module!=='undefined')module.exports=api;else root.DouyinText=api;})(globalThis);
