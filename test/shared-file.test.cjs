const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(require.resolve('../panel.js'),'utf8'),parser=require('../parser.js');
const sample='【抖音】\n主标题：抖音标题\n简介：共用正文 #工具\n【今日头条】\n主标题：头条标题\n简介：头条正文';
function panel(origin,db){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',checked:false,hidden:false,closest:()=>({}),dataset:{}});return nodes.get(id);};
 const host={dataset:{},isConnected:true,style:{},attachShadow:()=>({set innerHTML(s){for(const m of s.matchAll(/id="([^"]+)"/g))node(m[1]);},getElementById:node}),addEventListener(){},remove(){this.isConnected=false;}};
 vm.runInNewContext(code,{location:{origin,pathname:'/profile_v4/xigua/upload-video'},document:{getElementById:()=>null,createElement:()=>host,documentElement:{appendChild(){}}},chrome:{storage:{local:{get:async()=>structuredClone(db),set:async data=>Object.assign(db,structuredClone(data))}}},DouyinText:parser,TextDecoder,setTimeout,clearTimeout,Event,console});
 return {node,async settle(){await new Promise(r=>setTimeout(r,5));},async select(text,name='项目.txt'){node('file').files=[{name,size:text.length,arrayBuffer:async()=>new TextEncoder().encode(text).buffer}];await node('file').onchange();await this.settle();}};
}
test('one selection is reused on another platform and replaces a stale draft',async()=>{
 const db={'draft-今日头条':{title:'旧项目',description:'旧内容',source:'旧.txt'}};
 const a=panel('https://creator.douyin.com',db);await a.select(sample);
 const b=panel('https://mp.toutiao.com',db);await b.settle();
 assert.equal(b.node('title').value,'头条标题');assert.equal(b.node('description').value,'头条正文');assert.match(b.node('source').textContent,/项目.txt/);
});
test('same-file edits survive reopening; a newly selected file takes precedence',async()=>{
 const db={};const a=panel('https://creator.douyin.com',db);await a.select(sample);
 const b=panel('https://mp.toutiao.com',db);await b.settle();b.node('title').value='手改标题';b.node('title').oninput();await new Promise(r=>setTimeout(r,250));
 const c=panel('https://mp.toutiao.com',db);await c.settle();assert.equal(c.node('title').value,'手改标题');
 await a.select(sample.replace('头条标题','新项目标题'),'新项目.txt');
 const d=panel('https://mp.toutiao.com',db);await d.settle();assert.equal(d.node('title').value,'新项目标题');
});
test('missing current section reports failure rather than restoring a stale project',async()=>{
 const db={'draft-今日头条':{title:'旧',description:'旧'}};
 const a=panel('https://creator.douyin.com',db);await a.select('【抖音】\n主标题：新\n简介：正文');
 const b=panel('https://mp.toutiao.com',db);await b.settle();assert.equal(b.node('title').value,'');assert.match(b.node('status').textContent,/今日头条/);assert.equal(b.node('fill').disabled,true);
});
