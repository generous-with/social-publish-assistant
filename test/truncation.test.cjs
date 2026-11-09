const {test}=require('node:test'),assert=require('node:assert/strict');
const parser=require('../parser.js');
test('overlong Toutiao title imports truncated preview instead of failing',()=>{
 const d=parser.parse('【今日头条】\n主标题：（本地 Agent 浏览器 ego 推 Windows 版，免费）\n简介：'+ '文'.repeat(401),'今日头条');
 assert.equal(d.title.length,30);assert.equal(d.description.length,400);
 assert.equal(d.truncations.length,2);parser.validate(d,'今日头条');
});
test('all platform text limits and surrogate boundaries are respected',()=>{
 for(const [p,t,b] of [['抖音',30,1000],['B站',80,2000],['小红书',20,1000],['知乎',100,2000],['YouTube',100,5000],['Facebook',0,1000],['X',0,1000]]){
  const source=['Facebook','X'].includes(p)?'抖音':p;
  const d=parser.parse('【'+source+'】\n主标题：'+ '字'.repeat(t||30)+'😀\n简介：'+'文'.repeat(b-1)+'😀\n粉丝动态：'+'动'.repeat(234),p);
  assert.ok(d.title.length<=t);assert.ok(d.description.length<=b);assert.ok(!/[\uD800-\uDBFF]$/.test(d.description));parser.validate(d,p);
 }
});
test('Xiaohongshu reserves space for topic tokens',()=>{
 const d=parser.parse('【小红书】\n主标题：示例\n简介：'+'文'.repeat(1000)+'\n标签：#工具 #教程','小红书');
 assert.deepEqual(d.tags,['工具','教程']);assert.equal(d.description.length,992);parser.validate(d,'小红书');
});
