// Real API smoke and viewport checks. Existing records are read; no sample data is inserted.
import {chromium} from 'playwright-core'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const env=Object.fromEntries(readFileSync(new URL('../../backend/.env',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)]}))
const out=new URL('../.cache/student-workbench/',import.meta.url);mkdirSync(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
const page=await ctx.newPage();page.setDefaultTimeout(30000)
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const base='http://127.0.0.1:4173/#'
async function ready(){await page.waitForFunction(()=>!Array.from(document.querySelectorAll('main [role=status]')).some(n=>['正在加载…','正在确认提交资格…'].includes(n.textContent?.trim())));assert.equal(await page.locator('main .state-block[role=alert]').count(),0)}
async function nav(path){await page.goto(base+path);await page.locator('main h1').waitFor();await ready()}
try{
  await page.goto(base+'/login');await page.locator('#login-username').fill('student.demo');await page.locator('#login-password').fill(env.LOCAL_STUDENT_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>!u.hash.startsWith('#/login'));await ready()
  await nav('/student/assignments');assert.equal(await page.getByRole('button',{name:/^待完成/}).getAttribute('aria-pressed'),'true')
  await page.getByRole('button',{name:/^全部 \d/}).click();await ready();const count=await page.locator('.task-table-row').count();assert.ok(count>0)
  if(await page.getByRole('button',{name:'下一页',exact:true}).count()){await page.getByRole('button',{name:'下一页',exact:true}).click();assert.ok(page.url().includes('page=2'));await ready();await page.getByRole('button',{name:/^已批改/}).click();await ready();assert.ok(page.url().includes('page=1'))}
  const routes=[['home','/student/home'],['tasks','/student/assignments?status=all'],['courses','/course'],['records','/student/progress'],['calendar','/student/calendar?date=2026-11-20'],['messages','/student/messages']]
  for(const width of [1440,1024,320,375,430]){
    await page.setViewportSize({width,height:900})
    for(const[label,path]of routes){await nav(path);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' overflow '+width);await page.screenshot({path:fileURLToPath(new URL(label+'-'+width+'.png',out)),fullPage:true})}
    if(width===375){await page.getByRole('button',{name:'更多导航',exact:true}).click();await page.locator('.workspace-sidebar.is-open').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.workspace-sidebar.is-open').count(),0)}
  }
  await nav('/student/messages');await page.getByRole('button',{name:'未读',exact:true}).click();await ready();assert.equal(await page.locator('.notification-item:not(.unread)').count(),0)
  assert.deepEqual(errors,[])
  writeFileSync(new URL('result.json',out),JSON.stringify({at:new Date().toISOString(),result:'PASS',viewports:[1440,1024,320,375,430],pages:routes.map(r=>r[0]),checks:['real API read','default todo','pagination and filter reset','unread filter','mobile menu Escape','no page overflow','no browser exceptions'],fixtureWrites:0},null,2))
  console.log('PASS: student workbench real API, filters, pagination, 1440/1024/320/375/430 screenshots, mobile menu, no overflow.')
}catch(e){console.error(e.message);await page.screenshot({path:fileURLToPath(new URL('failure.png',out)),fullPage:true}).catch(()=>{});throw e}finally{await browser.close()}
