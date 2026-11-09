async function fillXhs(data,overwrite,mode='video'){try{
const isArticle=mode==='article';
if(location.origin!=='https://creator.xiaohongshu.com'||location.pathname!=='/publish/publish'||new URLSearchParams(location.search).get('target')!==mode)throw Error(isArticle?'请打开小红书长文发布表单':'请打开小红书视频发布页');const tags=[...new Set(data.tags||[])];if((!isArticle&&(!data.title?.trim()||data.title.length>20))||!data.description?.trim()||data.description.length+tags.reduce((n,t)=>n+t.length+2,0)>1000||tags.length>10)throw Error('标题限20字、正文含话题限1000字、话题最多10个');
const visible=e=>e.getClientRects().length>0;const all=(s,root=document)=>[...root.querySelectorAll(s)].filter(visible);const norm=s=>s.replace(/[\u200b\ufeff]/g,'').trim();const unique=(s,root=document)=>{const a=all(s,root);if(a.length!==1)throw Error('无法唯一定位：'+s+'（'+a.length+'个）');return a[0];};const sleep=ms=>new Promise(r=>setTimeout(r,ms));const until=async(fn,ms=5000)=>{const end=Date.now()+ms;do{const result=fn();if(result)return result;await sleep(100);}while(Date.now()<end);return null;};const exact=(text,root=document)=>all('button,label,span,div,p',root).filter(e=>norm(e.innerText??e.textContent)===text&&!Array.from(e.children).some(c=>norm(c.innerText??c.textContent)===text));const click=e=>{const view=e.ownerDocument.defaultView;for(const type of ['pointerdown','mousedown','pointerup','mouseup'])e.dispatchEvent(new view.MouseEvent(type,{bubbles:true,cancelable:true,view}));e.click();};const editor=()=>unique(isArticle?'.tiptap-container .tiptap.ProseMirror[contenteditable="true"]':'[contenteditable="true"]:not(.ql-clipboard)');const select=(e,append)=>{e.focus();const range=document.createRange();range.selectNodeContents(e);if(append)range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);};const insert=(text,append)=>{select(editor(),append);if(!document.execCommand('insertText',false,text))throw Error('正文编辑器拒绝输入');};const results=[],errors=[];const step=async(name,fn)=>{try{results.push(name+'：'+(await fn()||'完成'));}catch(e){errors.push(name+'：'+e.message);}};
if(isArticle){
  unique('.img-list .flex-list');
  await step('发布描述',async()=>{
    const paragraphText=text=>norm(text).replace(/\u00a0/g,' ').replace(/[ \t]*[\r\n]+[ \t\r\n]*/g,'\n');
    const read=()=>paragraphText(editor().innerText.replace(/(?:\s*#[^#\n]+\[话题\]#)+\s*$/u,''));
    const expected=paragraphText(data.description);
    const current=read();
    if(current&&current!==expected&&!overwrite)throw Error('页面已有描述，请检查后勾选替换');
    if(current!==expected)insert(data.description,false);
    if(!await until(()=>read()===expected,1800))throw Error('回读与预览不一致');
  });
}else await step('标题和正文',async()=>{const title=unique('input[placeholder*=标题],input[placeholder*=赞]');if(!overwrite&&((title.value.trim()&&title.value!==data.title)||(norm(editor().innerText)&&norm(editor().innerText)!==data.description)))throw Error('页面已有不同文案，请勾选替换');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,data.title);title.dispatchEvent(new Event('input',{bubbles:true}));title.dispatchEvent(new Event('change',{bubbles:true}));insert(data.description,false);await sleep(150);if(title.value!==data.title||norm(editor().innerText)!==data.description)throw Error('回读不一致');});
if(!errors.length&&tags.length)await step('话题',async()=>{
  const clean=text=>text.replace(/[\u200b\ufeff]/g,'').replace(/\u00a0/g,' ');
  const chipNames=()=>new Set([
    ...Array.from(clean(editor().textContent).matchAll(/#([^#\n]+)\[话题\]#/g),match=>norm(match[1])),
    ...Array.from(editor().querySelectorAll('[data-type=topic],.topic-tag,[data-topic-tag]'),node=>
      norm(node.textContent).replace(/^#/,'').replace(/\[话题\]#$/,''))
  ]);
  const firstSuggestion=()=>{
    const [list]=all('#creator-editor-topic-container');
    const row=list&&all('.item',list)[0];
    const name=norm(row?.querySelector('.name')?.textContent||'').replace(/^#/,'');
    return name?{row,name}:null;
  };
  const caretAfterTopic=keyword=>{
    const current=editor();
    const walker=document.createTreeWalker(current,NodeFilter.SHOW_TEXT);
    let last;
    for(let node=walker.nextNode();node;node=walker.nextNode()){
      if(clean(node.data).trim())last=node;
    }
    if(!last)return false;
    const end=last.data.replace(/[\u200b\ufeff]+$/u,'').length;
    if(!last.data.slice(0,end).endsWith('#'+keyword))return false;
    const selection=getSelection();
    if(selection.isCollapsed&&selection.anchorNode===last&&selection.anchorOffset===end)return true;
    current.focus();
    const range=document.createRange();
    range.setStart(last,end);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.isCollapsed&&selection.anchorNode===last&&selection.anchorOffset===end;
  };
  const removeQuery=(before,addition)=>{
    const current=editor();
    const text=clean(current.textContent);
    if(text===before)return true;
    if(!text.startsWith(before)||!addition.startsWith(text.slice(before.length)))return false;
    const walker=document.createTreeWalker(current,NodeFilter.SHOW_TEXT);
    let remaining=before.length;
    for(let node=walker.nextNode();node;node=walker.nextNode()){
      for(let offset=0;offset<node.data.length;offset++){
        if(!clean(node.data[offset]))continue;
        if(remaining--!==0)continue;
        current.focus();
        const range=document.createRange();
        range.selectNodeContents(current);
        range.setStart(node,offset);
        const selection=getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('delete');
        return clean(editor().textContent)===before;
      }
    }
    return false;
  };
  const addTopic=async keyword=>{
    const existing=chipNames();
    if(existing.has(keyword))return {name:keyword};
    const before=clean(editor().textContent);
    const addition=(/\s$/.test(before)?'':' ')+'#'+keyword;
    const previous=firstSuggestion();
    insert(addition,true);
    if(isArticle&&!caretAfterTopic(keyword)){
      if(!removeQuery(before,addition))throw Error('无法定位话题末尾或安全清理搜索文字，请检查正文');
      return {error:'无法将光标定位到话题末尾'};
    }
    await sleep(300);
    const suggestion=await until(()=>{
      const next=firstSuggestion();
      if(next&&(next.row!==previous?.row||next.name!==previous.name))return next;
    },4500);
    if(suggestion&&(!isArticle||caretAfterTopic(keyword))){
      if(existing.has(suggestion.name)){
        if(!removeQuery(before,addition))throw Error('无法安全清理话题“'+keyword+'”的搜索文本，请检查简介末尾');
        return {name:suggestion.name};
      }
      click(suggestion.row);
      if(await until(()=>chipNames().has(suggestion.name),2000))return {name:suggestion.name};
    }
    if(!removeQuery(before,addition))throw Error('无法安全清理话题“'+keyword+'”的搜索文本，请检查简介末尾');
    return {error:suggestion?'平台未确认生成话题':'未出现推荐话题'};
  };
  const matched=[],skipped=[];
  for(const tag of tags){
    let result=await addTopic(tag);
    const simplified=tag.replace(/[^\p{L}\p{N}\p{M}]/gu,'');
    if(result.error&&simplified&&simplified!==tag)result=await addTopic(simplified);
    if(result.error)skipped.push('“'+tag+'”（'+result.error+'）');
    else matched.push(tag===result.name?'“'+tag+'”':'“'+tag+'” → “'+result.name+'”');
  }
  if(skipped.length)errors.push('话题未添加 '+skipped.join('、'));
  return '已确认 '+chipNames().size+' 个'+(matched.length?'，'+matched.join('、'):'');
});
await step('原创声明',async()=>{if(data.original===false)return '未启用自动声明';const getSwitch=()=>{let switches=all('.original-wrapper .d-switch');if(switches.length===1)return switches[0];const labels=exact('原创声明');const found=new Set();for(const label of labels){let parent=label.parentElement;for(let n=0;n<4&&parent;n++,parent=parent.parentElement){const a=all('[role=switch],.d-switch,input[type=checkbox]',parent);if(a.length===1){found.add(a[0]);break;}if(a.length>1)break;}}if(found.size!==1)throw Error('找不到唯一原创声明开关');return [...found][0];};const enabled=()=>{const sw=getSwitch(),input=sw.matches('input')?sw:sw.querySelector('input');return Boolean(input?.checked)||sw.getAttribute('aria-checked')==='true';};if(enabled())return '已开启，跳过重复声明';const findDialog=()=>{const roots=all('[role=dialog],.d-modal,.d-dialog,.d-modal-container,.el-dialog,.modal');const a=roots.filter(e=>e.textContent.includes('声明原创')&&e.textContent.includes('我已阅读并同意'));return a.find(e=>!a.some(child=>child!==e&&e.contains(child)));};if(!findDialog())click(getSwitch());const dialog=await until(findDialog);if(!dialog)throw Error('未找到原创声明协议弹窗');const agree=[...dialog.querySelectorAll('input[type=checkbox]')];if(!agree.length)agree.push(...all('[role=checkbox]',dialog));if(agree.length!==1)throw Error('协议复选框不唯一');const isChecked=()=>agree[0].checked===true||agree[0].getAttribute('aria-checked')==='true';if(!isChecked()){const label=agree[0].closest('label')||agree[0].parentElement;const simulator=label?.querySelector('.d-checkbox-simulator');click(simulator||agree[0]);if(!await until(isChecked,1500))throw Error('未确认协议已勾选');}const confirm=all('button',dialog).filter(e=>norm(e.textContent)==='声明原创');if(confirm.length!==1||confirm[0].disabled)throw Error('声明原创按钮不可用');click(confirm[0]);if(!await until(enabled,3000))throw Error('声明后开关未开启');return '已勾选同意并声明原创';});
return {ok:errors.length===0,message:results.concat(errors.map(s=>'未完成：'+s)).join('\n')+'\n请核对后手动发布。',diagnostics:errors.length?{version:'1.9.23',errors,editors:all('[contenteditable=true]').map(e=>({class:e.className,role:e.getAttribute('role'),placeholder:e.getAttribute('data-placeholder'),length:e.textContent.length})),switches:all('[role=switch],.d-switch').map(e=>({class:e.className,checked:e.getAttribute('aria-checked'),parent:e.parentElement?.className})),dialogs:all('[role=dialog],.d-modal,.d-dialog,.d-modal-container,.el-dialog,.modal').map(e=>({class:e.className,role:e.getAttribute('role')}))}:undefined};
}catch(e){return {ok:false,message:e.message};}}
