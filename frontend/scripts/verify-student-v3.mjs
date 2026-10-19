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
 assert.deepEqual(errors,[]);
 assert.deepEqual(requests.filter(r=>r.method!=='GET'&&r.path!=='/api/v1/auth/login'),[]);
 writeFileSync(new URL('result.json',out),JSON.stringify({result:'PASS',measurements,browserErrors:errors,businessWrites:0},null,2));
 console.log('PASS: six student pages / six widths, real read-only data, bottom navigation and final actions reachable.');
}finally{await browser.close()}
