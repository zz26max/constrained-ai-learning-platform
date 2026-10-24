import {chromium} from 'playwright-core'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const env=Object.fromEntries(readFileSync(new URL('../../backend/.env',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)]}))
const out=new URL('../.cache/student-v3/',import.meta.url);mkdirSync(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
page.setDefaultTimeout(30000)
const base='http://127.0.0.1:4173/#',requests=[],errors=[],measurements=[]
page.on('request',r=>{if(r.url().includes('/api/v1/'))requests.push({method:r.method(),path:new URL(r.url()).pathname})})
page.on('pageerror',e=>errors.push(e.message))
async function ready(){await page.locator('main h1').waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('main [role=status]')).some(n=>/正在加载|正在读取|正在确认提交资格/.test(n.textContent??'')));assert.equal(await page.locator('main .state-block[role=alert]').count(),0)}
async function design(v){const details=page.locator('details.bplus-preview-switch');if(await details.count()&&!await details.getAttribute('open')){if(!await details.evaluate(n=>n.open))await details.locator('summary').click()}const labels={current:'现有首页',a:'A · 编辑式',b:'B · 模块化',bplus:'B+ · 精修'};await page.locator('.home-preview-switch nav a').filter({hasText:labels[v]}).click();await ready();if(await page.locator('details.bplus-preview-switch').count())await page.locator('details.bplus-preview-switch').evaluate(n=>n.open=false)}
async function snapshot(name){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:true})}
const coreReads=()=>requests.filter(r=>r.path==='/api/v1/me/dashboard'||r.path==='/api/v1/me/assignments').length
async function reachable(locator){await locator.evaluate(n=>n.scrollIntoView({block:'center'}));assert.ok(await locator.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===n||n.contains(hit)}),'click target covered')}
try{
 await page.goto(base+'/student/home');await page.locator('#login-username').fill('student.demo');await page.locator('#login-password').fill(env.LOCAL_STUDENT_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>!u.hash.startsWith('#/login'));await ready();
 assert.equal(await page.locator('.home-preview-switch').count(),0);
 const routes={home:'/student/home',courses:'/course',records:'/student/progress',assignments:'/student/assignments',calendar:'/student/calendar',messages:'/student/messages'};
 for(const [name,route] of Object.entries(routes)){
  await page.goto(base+route);await ready();
  for(const width of [1440,1024,320,375,390,430]){
   await page.setViewportSize({width,height:width>760?1000:844});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+name+' '+width);
   await snapshot(name+'-'+width);
   if(width<=760){
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    const nav=await page.locator('.mobile-primary-nav').boundingBox();assert.ok(nav&&nav.y<844);
    const targets=page.locator('main a:visible,main button:visible:not([disabled])');
    if(await targets.count())await reachable(targets.last());
   }
   measurements.push({name,width,overflow:false});
  }
 }

 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/student/assignments');await ready();
 for(const name of ['已提交','已批改','全部','待完成']){await page.getByRole('button',{name:new RegExp('^'+name)}).click();await ready()}
 const blocked=page.locator('.task-table-row').filter({hasText:'已截止'});
 for(const row of await blocked.all())assert.equal(await row.locator('a.button').innerText(),'查看详情');
 await page.goto(base+'/student/calendar');await ready();
 await page.getByRole('button',{name:'下一周',exact:true}).click();await ready();
 await page.locator('.calendar-week-strip button').last().click();await ready();
 assert.equal(await page.locator('.calendar-week-strip [aria-pressed=true]').count(),1);
 await page.goto(base+'/student/messages');await ready();
 for(const name of ['未读','作业','评价','公告','全部']){await page.getByRole('button',{name,exact:true}).click();await ready()}
 await page.getByRole('button',{name:'更多导航',exact:true}).click();
 await page.keyboard.press('Escape');assert.equal(await page.locator('.workspace-sidebar.is-open').count(),0);
 // Display fixtures only intercept GET responses in this isolated browser page.
 let scenario='long';
 await page.route('**/api/v1/**',async route=>{
  if(route.request().method()!=='GET')return route.continue();
  const response=await route.fetch();
  if(!response.ok())return route.fulfill({response});
  const body=await response.json();const path=new URL(route.request().url()).pathname;const data=body.data;
  if(path==='/api/v1/me/courses'&&data?.items){
   if(scenario==='empty')data.items=[];
   else data.items.forEach((c,i)=>{c.title=i===0?'计算机网络与分布式系统':'课程2026-10-19T13-28-00-003Z_AdvancedLearningSystems'.repeat(4)})
   if(scenario==='empty')data.total=0;
  }
  if(path.endsWith('/chapters')&&data?.items){
   if(['empty','no-records'].includes(scenario))data.items=[];
   if(scenario==='many'&&data.items[0])data.items=Array.from({length:24},(_,i)=>({...data.items[0],id:'10000000-0000-4000-8000-'+String(i).padStart(12,'0'),number:i+1,title:'章节 '+(i+1)+' · 数据组织与学习路径',studentProgress:null}));
  }
  if(path.endsWith('/learning-records')&&scenario==='no-records'&&data?.summary){data.summary.completedLabCount=0;data.summary.publishedFeedbackCount=0;data.recentFeedback=null;data.feedbackPage.items=[];data.feedbackPage.total=0}
  await route.fulfill({response,json:body});
 });
 for(scenario of ['long','many','empty','no-records']){
  for(const [name,route] of Object.entries({courses:'/course',records:'/student/progress'})){
   await page.goto(base+route);await ready();
   for(const width of [390,1440]){await page.setViewportSize({width,height:width===390?844:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await snapshot('fixture-'+scenario+'-'+name+'-'+width)}
  }
 }
 await page.unroute('**/api/v1/**');
 assert.deepEqual(errors,[]);
 assert.deepEqual(requests.filter(r=>r.method!=='GET'&&r.path!=='/api/v1/auth/login'),[]);
 writeFileSync(new URL('result.json',out),JSON.stringify({result:'PASS',measurements,browserErrors:errors,businessWrites:0},null,2));
 console.log('PASS: six student pages / six widths, real read-only data, bottom navigation and final actions reachable.');
}finally{await browser.close()}
