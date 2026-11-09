async function fillZhihu(data,overwrite){try{
if(location.origin!=='https://www.zhihu.com'||location.pathname!=='/upload-video')throw Error('请打开知乎视频发布页');if(!data.title?.trim()||!data.description?.trim())throw Error('标题或简介为空');const visible=e=>e.getClientRects().length>0;const all=(s,root=document)=>[...root.querySelectorAll(s)].filter(visible);const trim=s=>s.replace(/[\u200b\ufeff]/g,'').trim();const unique=(s,root=document)=>{const a=all(s,root);if(a.length!==1)throw Error('无法唯一定位：'+s+'（'+a.length+'个）');return a[0];};const pause=ms=>new Promise(r=>setTimeout(r,ms));const until=async(fn,ms=6000)=>{const end=Date.now()+ms;do{const value=fn();if(value)return value;await pause(100);}while(Date.now()<end);return null;};const text=e=>trim(e.innerText??e.textContent);const exact=(name,root=document)=>all('button,label,span,div,p,li,a,[role=option]',root).filter(e=>text(e).replace(/[\s*]/g,'')===name.replace(/\s/g,'')&&!Array.from(e.children).some(c=>text(c).replace(/[\s*]/g,'')===name.replace(/\s/g,'')));const click=e=>{for(const type of ['mousedown','mouseup','click'])e.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window}));};const field=(name,selector)=>{const found=new Set();for(const label of exact(name)){for(let e=label.parentElement,n=0;e&&e!==document.body&&n<6;e=e.parentElement,n++){const a=all(selector,e);const roots=a.filter(el=>!a.some(other=>other!==el&&other.contains(el)));if(roots.length===1){found.add(roots[0]);break;}if(roots.length>1)break;}}if(found.size!==1)throw Error('无法唯一定位知乎“'+name+'”控件');return [...found][0];};const getTitle=()=>{const a=all('input[placeholder*=标题],textarea[placeholder*=标题]');if(a.length===1)return a[0];return field('标题与介绍','input:not([type=file]):not([type=hidden]),textarea');};const getEd=()=>{const a=all('[contenteditable=true]:not(.ql-clipboard)');if(a.length===1)return a[0];return unique('textarea[placeholder*=想法],textarea[placeholder*=介绍]');};const read=e=>e.matches('input,textarea')?e.value:text(e);const setInput=(e,s)=>{const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,s);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};const insert=(s,append)=>{const ed=getEd();ed.focus();if(ed.tagName==='TEXTAREA'){setInput(ed,append?ed.value+s:s);return;}const r=document.createRange();r.selectNodeContents(ed);if(append)r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);if(!document.execCommand('insertText',false,s))throw Error('知乎正文编辑器未接受输入');};const results=[],errors=[];const step=async(name,fn)=>{try{results.push(name+'：'+(await fn()||'完成'));}catch(e){errors.push(name+'：'+e.message);}};
let bodyReady=false;const canonical=s=>trim(s).replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n').replace(/\n+/g,'\n');
await step('视频标记',async()=>{
  const target='个人观点仅供参考';
  const normalize=value=>trim(value||'').replace(/[\s，,。]/g,'');
  const selector='button.VideoUploadForm-videoTypeSelectOverlay[aria-label="选择视频标记"]';
  const onlyVisible=selector=>{
    const matches=all(selector);
    return matches.length===1?matches[0]:null;
  };
  const trigger=()=>onlyVisible(selector);
  const modal=()=>onlyVisible('.VideoUploadForm-videoTypeModalContent');
  const opener=await until(trigger,1500);
  if(!opener){
    await choose('视频标记',target,'选择标记');
    return target;
  }
  const selected=()=>{
    const value=trigger()?.closest('.VideoUploadForm-selectContainer--modalTrigger')?.querySelector('.Select-button');
    return value&&normalize(text(value))===target;
  };
  if(selected()&&!modal())return target;
  if(!modal()){
    opener.scrollIntoView({block:'nearest'});
    click(opener);
  }
  const option=await until(()=>{
    const dialog=modal();
    if(!dialog)return null;
    const matches=all('.VideoUploadForm-videoTypeModalOption',dialog).filter(node=>normalize(text(node))===target);
    return matches.length===1?matches[0]:null;
  });
  if(!option)throw Error('添加视频标记弹窗中未找到“'+target+'”');
  const checked=()=>Boolean(option.querySelector('.VideoUploadForm-videoTypeModalIcon')?.childElementCount);
  if(!checked()){
    option.scrollIntoView({block:'nearest'});
    click(option);
    if(!await until(checked,2000))throw Error('弹窗中未确认选中“'+target+'”');
  }
  const confirm=await until(()=>{
    const dialog=modal();
    if(!dialog)return null;
    const matches=all('.VideoUploadForm-videoTypeModalActions button',dialog).filter(button=>
      text(button)==='确认'&&!button.matches(':disabled,[aria-disabled=true]'));
    return matches.length===1?matches[0]:null;
  },2000);
  if(!confirm)throw Error('未找到可用的“确认”按钮');
  click(confirm);
  if(!await until(()=>!modal()&&selected(),3000))throw Error('确认后未显示“'+target+'”');
  return target;
});
await step('标题',async()=>{const title=getTitle();if(title.maxLength>0&&data.title.length>title.maxLength)throw Error('标题超过页面上限');if(!overwrite&&read(title)&&read(title)!==data.title)throw Error('已有不同标题，请勾选替换');setInput(title,data.title);await pause(150);if(read(getTitle())!==data.title)throw Error('标题未保留');});
await step('简介',async()=>{const ed=getEd();if(!overwrite&&read(ed)&&canonical(read(ed))!==canonical(data.description))throw Error('已有不同简介，请勾选替换');if(ed.tagName==='TEXTAREA')setInput(ed,data.description);else{ed.focus();const range=document.createRange();range.selectNodeContents(ed);getSelection().removeAllRanges();getSelection().addRange(range);const transfer=new DataTransfer();transfer.setData('text/plain',data.description);await pause(60);ed.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:transfer}));await pause(250);if(canonical(read(getEd()))!==canonical(data.description)){const root=getEd();if(root.classList.contains('public-DraftEditor-content'))throw Error('Draft.js未接受完整正文（预期'+data.description.length+'字，实际'+read(root).length+'字），停止话题以保护内容');insert(data.description,false);}}if(!await until(()=>canonical(read(getEd()))===canonical(data.description),2000))throw Error('正文回读不一致（预期'+data.description.length+'字，实际'+read(getEd()).length+'字）');bodyReady=true;});
if(bodyReady)await step('话题',async()=>{let count=0;const selected=()=>getEd().querySelectorAll('[contenteditable=false],a[href*="/topic/"],[data-topic-id],[data-type=mention],.mention,.TopicLink').length;for(const tag of [...new Set(data.tags||[])]){const before=selected();insert(' #',true);await pause(100);insert(tag,true);const first=()=>{const ed=getEd(),controls=ed.getAttribute('aria-controls');const linked=controls&&document.getElementById(controls);const roots=linked&&visible(linked)?[linked]:all('[role=listbox],.Popover-content,.MentionSuggestions,.TopicSuggestions,.AutoComplete-menu,[data-topic-suggestions]');for(const root of roots){const rows=all('[role=option],.Menu-item,.List-item,li,.MentionSuggestions-entry,.TopicSuggestions-item,.Select-option',root);const outer=rows.filter(e=>!rows.some(other=>other!==e&&other.contains(e)));if(outer.length&&outer.some(row=>text(row).toLowerCase().includes(tag.toLowerCase())))return outer[0];}return null;};const candidate=await until(first,8000);if(!candidate)throw Error('输入#'+tag+'后未出现话题候选列表；已完成'+count+'个');click(candidate);if(!await until(()=>selected()>before,3000))throw Error('第一候选提交后未确认生成话题；已完成'+count+'个');count++;}return count+'个，按#→名称→第一候选逐个添加';});
async function choose(name,target,placeholder){
  const key=value=>trim(value||'').replace(/[\s*，,：:。；;！!（）()]/g,'');
  const targetKey=key(target);
  const optionsSelector='.Select-option,[role=option],.Menu-item';
  const menusSelector='[role=listbox],.Popover-content,.Select-menu';
  const strongControls='select,[role=combobox],.Select-button,[aria-haspopup=listbox]';
  const controls='button,select,input,[role=combobox],.Select-button,[aria-haspopup=listbox]';
  const outer=nodes=>nodes.filter(e=>!nodes.some(other=>other!==e&&other.contains(e)));
  const only=nodes=>nodes.length===1?nodes[0]:null;
  const isControl=e=>!e.closest(optionsSelector+','+menusSelector)&&!e.matches('input[type=hidden],input[type=file]');
  const prompts=new Set([placeholder,'请'+placeholder,'选择'+name,'请选择'+name]);
  const looksRight=e=>[text(e),e.getAttribute('placeholder'),e.getAttribute('aria-label')].some(value=>
    prompts.has(key(value))||key(value)===targetKey);

  const locate=()=>{
    const labels=all('label,span,div,p').filter(e=>key(text(e))===name&&
      !Array.from(e.children).some(child=>key(text(child))===name));
    const scoped=new Set();
    for(const label of labels){
      for(let row=label.parentElement,n=0;row&&row!==document.body&&n<5;row=row.parentElement,n++){
        const candidates=outer(all(controls,row).filter(isControl));
        const match=only(candidates.filter(looksRight))||only(candidates.filter(e=>e.matches(strongControls)));
        if(match){scoped.add(match);break;}
        if(candidates.length===1){scoped.add(candidates[0]);break;}
        if(candidates.some(e=>e.matches(strongControls)))break;
      }
    }
    return only([...scoped])||only(outer(all(controls).filter(e=>isControl(e)&&looksRight(e))));
  };
  let control=locate();
  if(!control)throw Error('无法定位知乎“'+name+'”控件');
  const get=()=>control?.isConnected?control:(control=locate());
  const selected=()=>{
    const current=get();
    if(!current)return false;
    if(current.tagName==='SELECT')return key(current.selectedOptions[0]?.textContent)===targetKey;
    return key(text(current))===targetKey||key(current.value)===targetKey;
  };
  if(selected())return;
  if(control.tagName==='SELECT'){
    const item=[...control.options].find(e=>key(e.textContent)===targetKey&&!e.disabled);
    if(!item)throw Error('未找到选项“'+target+'”');
    setInput(control,item.value);
  }else{
    const beforeOptions=new Set(all(optionsSelector)),beforeMenus=new Set(all(menusSelector));
    const linked=()=>{
      const id=(get()?.getAttribute('aria-controls')||get()?.getAttribute('aria-owns')||'').split(/\s+/)[0];
      const menu=id&&document.getElementById(id);
      return menu&&visible(menu)?menu:null;
    };
    const existingMenu=linked();
    if(!existingMenu&&control.getAttribute('aria-expanded')!=='true'){
      control.scrollIntoView({block:'nearest'});
      click(control);
    }
    const menus=()=>{
      const menu=linked();
      return menu?[menu]:outer(all(menusSelector).filter(e=>!beforeMenus.has(e)));
    };
    const isTarget=e=>key(text(e))===targetKey||all('span,div,p',e).some(child=>key(text(child))===targetKey);
    const option=()=>{
      const roots=menus();
      const nodes=roots.length?roots.flatMap(menu=>all(optionsSelector,menu)):all(optionsSelector).filter(e=>!beforeOptions.has(e));
      return only(outer([...new Set(nodes)].filter(isTarget)));
    };
    const scrollable=e=>e.clientHeight>0&&e.scrollHeight>e.clientHeight+1&&/^(auto|scroll|overlay)$/.test(getComputedStyle(e).overflowY);
    let item=await until(option,700);
    const deadline=Date.now()+5500;
    if(!item){
      const lists=menus().flatMap(menu=>[menu,...all('div,ul,ol',menu)]).filter(scrollable);
      for(const list of lists){
        if(item)break;
        if(list.scrollTop){list.scrollTop=0;await pause(100);}
        while(list.isConnected&&Date.now()<deadline){
          item=option();
          if(item)break;
          const top=list.scrollTop;
          list.scrollTop+=Math.max(1,Math.floor(list.clientHeight*0.8));
          if(list.scrollTop===top)break;
          await pause(100);
        }
      }
    }
    if(!item)throw Error('下拉未出现唯一选项“'+target+'”');
    const roots=menus();
    for(let list=item.parentElement;list&&roots.some(menu=>menu.contains(list));list=list.parentElement){
      if(!scrollable(list))continue;
      const rect=item.getBoundingClientRect(),top=list.getBoundingClientRect().top+list.clientTop;
      const bottom=top+list.clientHeight;
      if(rect.top<top)list.scrollTop+=Math.floor(rect.top-top);
      else if(rect.bottom>bottom)list.scrollTop+=Math.ceil(rect.bottom-bottom);
    }
    await pause(100);
    item=option();
    if(!item||item.matches(':disabled,[aria-disabled=true]'))throw Error('目标选项不可用，请核对下拉菜单');
    click(item);
  }
  if(!await until(selected,2500))throw Error('选择后未显示“'+target+'”');
}
await step('所属领域',async()=>{await choose('所属领域','科技互联网','选择领域');return '科技互联网';});
return {ok:!errors.length,message:results.concat(errors.map(e=>'未完成：'+e)).join('\n')+'\n请检查后手动发布视频。',diagnostics:errors.length?{version:'1.9.24',errors,inputs:all('input,textarea').map(e=>({tag:e.tagName,class:e.className,placeholder:e.getAttribute('placeholder'),length:read(e).length})),editors:all('[contenteditable=true]').map(e=>({class:e.className,role:e.getAttribute('role'),length:read(e).length,blocks:e.querySelectorAll('[data-block=true]').length})),selectControls:all('.Select-button,button[role=combobox]').map(e=>({tag:e.tagName,class:e.className,text:text(e).slice(0,60)})),options:all('[role=option],.Select-option,.Menu-item,.List-item,.MentionSuggestions-entry').slice(0,20).map(e=>({tag:e.tagName,class:e.className,text:text(e).slice(0,60)}))}:undefined};
}catch(e){return {ok:false,message:e.message};}}
