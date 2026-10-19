import {chromium} from 'playwright-core'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const env=Object.fromEntries(readFileSync(new URL('../../backend/.env',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)]}))
const out=new URL('../.cache/home-exploration/',import.meta.url);mkdirSync(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
page.setDefaultTimeout(30000)
const base='http://127.0.0.1:4173/#'
const errors=[],requests=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('request',r=>{if(r.url().includes('/api/v1/'))requests.push({path:new URL(r.url()).pathname,method:r.method()})})
async function ready(){await page.locator('main h1').waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('main [role=status]')).some(n=>n.textContent?.includes('正在加载')||n.textContent?.includes('正在读取')));assert.equal(await page.locator('main .state-block[role=alert]').count(),0)}
async function variant(name){await page.locator('.home-preview-switch nav a').filter({hasText:name==='a'?'A · 编辑式':name==='b'?'B · 模块化':'现有首页'}).click();await ready()}
async function identity(){return page.evaluate(()=>({primary:document.querySelector('[data-home-action=primary]')?.getAttribute('href'),task:document.querySelector('[data-home-action=primary]')?.getAttribute('data-task-id'),tasks:Array.from(document.querySelectorAll('.explore-task-list [data-task-id]')).map(n=>n.getAttribute('data-task-id')),courses:Array.from(document.querySelectorAll('[data-course-id]')).map(n=>n.getAttribute('data-course-id')),counts:document.querySelector('.explore-overview')?.textContent?.replace(/\s/g,'')}))}
try{
  await page.goto(base+'/student/home?design=a');await page.locator('#login-username').fill('student.demo');await page.locator('#login-password').fill(env.LOCAL_STUDENT_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>!u.hash.startsWith('#/login'));await ready();assert.ok(page.url().endsWith('/student/home?design=a'),'login must restore selected design')
  const before=requests.length
  await variant('a');const a=await identity();await variant('b');assert.deepEqual(await identity(),a);assert.equal(requests.length,before,'design switching must not refetch or write')
  assert.ok(a.primary)
  assert.equal(await page.locator('[data-home-action=primary]').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)')
  if(a.task){const r=await page.evaluate(async id=>{const r=await fetch('/api/v1/assignments/'+id);return {status:r.status,data:(await r.json()).data}},a.task);assert.equal(r.status,200);assert.equal(r.data.canSubmit,true)}
  for(const width of [1440,1024,320,375,390,430]){
    await page.setViewportSize({width,height:width>760?1000:900})
    for(const v of ['a','b']){
      await variant(v);await page.evaluate(()=>scrollTo(0,0))
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+v+' '+width)
      assert.deepEqual(await identity(),a)
      await page.screenshot({path:fileURLToPath(new URL(v+'-'+width+'.png',out)),fullPage:true})
      if(width===390){const box=await page.locator('[data-home-action=primary]').boundingBox();assert.ok(box&&box.y+box.height<828,'primary action outside first mobile viewport '+v)}
    }
  }
  await page.locator('[data-home-action=primary]').click();await page.waitForURL(u=>!u.hash.startsWith('#/student/home'));await ready();await page.goBack();await ready()
  await variant('current');assert.equal(await page.locator('.dashboard-page').count(),1)
  assert.deepEqual(errors,[])
  const writes=requests.filter(r=>r.method!=='GET'&&r.path!=='/api/v1/auth/login')
  assert.deepEqual(writes,[])
  writeFileSync(new URL('result.json',out),JSON.stringify({at:new Date().toISOString(),result:'PASS',widths:[1440,1024,320,375,390,430],sameDataAcrossViews:true,switchRequests:0,primaryCanSubmit:true,primaryNavigation:true,originalPreserved:true,writes:0,browserErrors:errors},null,2))
  console.log('PASS: A/B same real data, switch makes no requests, real actionable task/navigation, original home, six viewports without overflow.')
}catch(e){console.error(e.message);await page.screenshot({path:fileURLToPath(new URL('failure.png',out)),fullPage:true}).catch(()=>{});throw e}finally{await browser.close()}
