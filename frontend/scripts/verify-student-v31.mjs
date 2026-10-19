import {chromium} from 'playwright-core'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const env=Object.fromEntries(readFileSync(new URL('../../backend/.env',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)]}))
const out=new URL('../.cache/student-v31/',import.meta.url);mkdirSync(out,{recursive:true})
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
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow '+width);
   if(width<=760){
    const navY=[];
    for(const fraction of [0,.5,1]){await page.evaluate(f=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f),fraction);navY.push((await page.locator('.mobile-primary-nav').boundingBox()).y)}
    assert.ok(Math.max(...navY)-Math.min(...navY)<1);
    const actions=page.locator('main a:visible,main button:visible:not([disabled])');if(await actions.count())await reachable(actions.last());
   }
   stats.push({name,width,courseHeight:name==='courses'?(await page.locator('.course-row').first().boundingBox())?.height:undefined,firstTask:name==='assignments'?await page.locator('.task-title').first().innerText():undefined,firstMessageHeight:name==='messages'?(await page.locator('.notification-item').first().boundingBox())?.height:undefined});
  }
 }
 assert.deepEqual(errors,[]);
 assert.deepEqual(requests.filter(r=>r.method!=='GET'&&r.path!=='/api/v1/auth/login'),[]);
 if(phase==='before')writeFileSync(frozenFile,JSON.stringify(frozen));
 writeFileSync(new URL(phase+'-result.json',out),JSON.stringify({result:'PASS',stats,browserErrors:errors,businessWrites:0},null,2));
 console.log('PASS: '+phase+' six pages / six widths; fixed-nav top/middle/bottom and final actions.');
}finally{await browser.close()}
