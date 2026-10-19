import {chromium} from 'playwright-core'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const env=Object.fromEntries(readFileSync(new URL('../../backend/.env',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)]}))
const out=new URL('../.cache/student-v32/',import.meta.url);mkdirSync(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
page.setDefaultTimeout(30000)
const base='http://127.0.0.1:4173/#',requests=[],errors=[]
page.on('request',r=>{if(r.url().includes('/api/v1/'))requests.push({method:r.method(),path:new URL(r.url()).pathname})})
page.on('pageerror',e=>errors.push(e.message))
async function ready(){await page.locator('main h1').waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('main [role=status]')).some(n=>/正在加载|正在读取|正在确认提交资格/.test(n.textContent??'')));assert.equal(await page.locator('main .state-block[role=alert]').count(),0)}
async function snapshot(name){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:true})}
async function reachable(locator){await locator.evaluate(n=>n.scrollIntoView({block:'center'}));assert.ok(await locator.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===n||n.contains(hit)}),'click target covered')}
const contrastChecks=[];
async function checkContrast(){
 const samples=await page.locator('main .workspace-heading h1,main .task-course,main .task-table-row time,main .task-status .tag,main .task-table-head,main .focus-course,main .bplus-deadline>span,main .explore-focus h2,main .record-feedback-meta,main .course-meta,main .notification-title,main .notification-content,main .calendar-chip').evaluateAll(nodes=>nodes.slice(0,80).map(n=>{
  let el=n,bg='rgb(255, 255, 255)';
  while(el){const c=getComputedStyle(el).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){bg=c;break}el=el.parentElement}
  return {text:n.textContent?.slice(0,30),fg:getComputedStyle(n).color,bg};
 }));
 const lum=c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
 for(const sample of samples){const a=lum(sample.fg),b=lum(sample.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5,'contrast '+JSON.stringify({...sample,ratio}));contrastChecks.push({...sample,ratio})}
}
const phase=process.argv[2]??'after';
const frozenFile=new URL('responses.json',out);
const frozen=phase==='before'?{}:JSON.parse(readFileSync(frozenFile,'utf8'));
const stats=[];
try{
 await page.goto(base+'/student/home');await page.locator('#login-username').fill('student.demo');await page.locator('#login-password').fill(env.LOCAL_STUDENT_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>!u.hash.startsWith('#/login'));await ready();
 await page.route('**/api/v1/**',async route=>{
  if(route.request().method()!=='GET')return route.continue();
  const u=new URL(route.request().url());const key=u.pathname+u.search;
  if(phase==='after'&&frozen[key])return route.fulfill({status:200,json:frozen[key]});
  const response=await route.fetch();
  if(response.ok()){const json=await response.json();frozen[key]=json;await route.fulfill({response,json})}else await route.fulfill({response});
 });
 for(const [name,route] of Object.entries({home:'/student/home',assignments:'/student/assignments',courses:'/course',records:'/student/progress',messages:'/student/messages',calendar:'/student/calendar?date=2026-10-19'})){
  await page.goto(base+route);await ready();
  for(const width of [1440,1024,430,390,375,320]){
   await page.setViewportSize({width,height:width>760?1000:844});await snapshot(phase+'-'+name+'-'+width);
   if([1440,390].includes(width)){
    const selectors={home:'.explore-focus',courses:'.course-row',records:'.record-section',assignments:'.task-table-row',messages:'.notification-item.unread',calendar:'.calendar-cell:has(.calendar-more)'};
    const detail=page.locator(selectors[name]).first();
    if(await detail.isVisible())await detail.screenshot({path:fileURLToPath(new URL(phase+'-detail-'+name+'-'+width+'.png',out))});
   }

   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow '+width);
   if(phase==='after'&&width===390)await checkContrast();
   if(width<=760){
    const navY=[];
    for(const fraction of [0,.5,1]){await page.evaluate(f=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f),fraction);navY.push((await page.locator('.mobile-primary-nav').boundingBox()).y)}
    assert.ok(Math.max(...navY)-Math.min(...navY)<1);
    const actions=page.locator('main a:visible,main button:visible:not([disabled])');if(await actions.count())await reachable(actions.last());
   }
   stats.push({name,width,courseHeight:name==='courses'?(await page.locator('.course-row').first().boundingBox())?.height:undefined,firstTask:name==='assignments'?await page.locator('.task-title').first().innerText():undefined,firstMessageHeight:name==='messages'?(await page.locator('.notification-item').first().boundingBox())?.height:undefined});
  }
 }

 if(phase==='after'){
  await page.setViewportSize({width:320,height:844});await page.goto(base+'/student/messages');await ready();
  const full=page.locator('.message-full').first();await full.locator('summary').focus();await page.keyboard.press('Enter');assert.ok(await full.getAttribute('open')!==null);
  assert.ok(await page.locator('.notification-item:has(details[open])>.notification-title').innerText());assert.ok(await full.locator('p').innerText());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await snapshot('detail-message-expanded-320');
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/student/home');await ready();
  const primary=page.locator('[data-home-action=primary]');await primary.focus();
  assert.equal(await primary.evaluate(n=>getComputedStyle(n).outlineColor),'rgb(242, 246, 255)');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.includes('查看全部待办')),true);
  await page.locator('.explore-focus').screenshot({path:fileURLToPath(new URL('detail-home-keyboard-focus.png',out))});
  await page.goto(base+'/student/calendar?date=2026-10-19');await ready();
  if(await page.locator('.calendar-next').count()){
   const label=await page.locator('.calendar-next p').first().innerText();await page.locator('.calendar-next button').click();await ready();assert.ok((await page.locator('.calendar-agenda').innerText()).includes(label));
  }
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/student/calendar?date=2026-10-24');await ready();
  const more=page.locator('.calendar-more').first();assert.ok((await more.boundingBox()).height>=44);
  const hiddenCount=Number((await more.innerText()).match(/\d+/)[0]);await more.click();await ready();assert.equal(await page.locator('.agenda-event').count(),hiddenCount+2);
  await page.locator('.calendar-agenda').screenshot({path:fileURLToPath(new URL('detail-calendar-selected-agenda.png',out))});
  await page.goto(base+'/student/assignments');await ready();
  await checkContrast();
  const rows=await page.locator('.task-table-row').all();let blocked=false;
  for(const row of rows){const text=await row.innerText();if(text.includes('不可提交'))blocked=true;else if(/开始作答|继续作答|继续补交/.test(text))assert.equal(blocked,false,'actionable after blocked')}
 }
 assert.deepEqual(errors,[]);
 assert.deepEqual(requests.filter(r=>r.method!=='GET'&&r.path!=='/api/v1/auth/login'),[]);
 if(phase==='before')writeFileSync(frozenFile,JSON.stringify(frozen));
 writeFileSync(new URL(phase+'-result.json',out),JSON.stringify({result:'PASS',stats,contrastChecks,browserErrors:errors,businessWrites:0},null,2));
 console.log('PASS: '+phase+' six pages / six widths; fixed-nav top/middle/bottom and final actions.');
}finally{await browser.close()}