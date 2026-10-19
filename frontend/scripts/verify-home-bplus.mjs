import {chromium} from 'playwright-core'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const env=Object.fromEntries(readFileSync(new URL('../../backend/.env',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)]}))
const out=new URL('../.cache/home-bplus/',import.meta.url);mkdirSync(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
page.setDefaultTimeout(30000)
const base='http://127.0.0.1:4173/#',requests=[],errors=[],measurements=[]
page.on('request',r=>{if(r.url().includes('/api/v1/'))requests.push({method:r.method(),path:new URL(r.url()).pathname})})
page.on('pageerror',e=>errors.push(e.message))
async function ready(){await page.locator('main h1').waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('main [role=status]')).some(n=>/正在加载|正在读取/.test(n.textContent??'')));assert.equal(await page.locator('main .state-block[role=alert]').count(),0)}
async function design(v){const details=page.locator('details.bplus-preview-switch');if(await details.count()&&!await details.getAttribute('open')){if(!await details.evaluate(n=>n.open))await details.locator('summary').click()}const labels={current:'现有首页',a:'A · 编辑式',b:'B · 模块化',bplus:'B+ · 精修'};await page.locator('.home-preview-switch nav a').filter({hasText:labels[v]}).click();await ready();if(await page.locator('details.bplus-preview-switch').count())await page.locator('details.bplus-preview-switch').evaluate(n=>n.open=false)}
async function snapshot(name){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:true})}
const coreReads=()=>requests.filter(r=>r.path==='/api/v1/me/dashboard'||r.path==='/api/v1/me/assignments').length
async function reachable(locator){await locator.evaluate(n=>n.scrollIntoView({block:'center'}));assert.ok(await locator.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===n||n.contains(hit)}),'click target covered')}
try{
  await page.goto(base+'/student/home?design=bplus');await page.locator('#login-username').fill('student.demo');await page.locator('#login-password').fill(env.LOCAL_STUDENT_PASSWORD);await page.getByRole('button',{name:'登录',exact:true}).click();await page.waitForURL(u=>!u.hash.startsWith('#/login'));await ready();assert.ok(page.url().endsWith('design=bplus'))
  assert.equal(await page.locator('[data-design=bplus]').count(),1)
  const taskId=await page.locator('[data-home-action=primary]').getAttribute('data-task-id');assert.ok(taskId)
  const detail=await page.evaluate(async id=>(await(await fetch('/api/v1/assignments/'+id)).json()).data,taskId);assert.equal(detail.canSubmit,true)
  const initialReads=coreReads()
  for(const width of [1440,1024,320,375,390,430]){
    const height=width>760?1000:844;await page.setViewportSize({width,height})
    let bHeight
    if([1440,390].includes(width)){await design('b');bHeight=(await page.locator('.explore-focus').boundingBox()).height;await snapshot('b-'+width)}
    await design('bplus');assert.equal(await page.locator('[data-home-action=primary]').getAttribute('data-task-id'),taskId)
    assert.equal(coreReads(),initialReads)
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width)
    assert.equal(await page.locator('.explore-focus time').count(),1)
    assert.equal(await page.locator('[data-course-id]').count(),1)
    const keys=await page.locator('.bplus-group-heading time').evaluateAll(ns=>ns.map(n=>Date.parse(n.getAttribute('datetime'))));assert.equal(new Set(keys).size,keys.length)
    assert.equal(await page.locator('.bplus-task-list time').count(),0)
    const focusHeight=(await page.locator('.explore-focus').boundingBox()).height
    if(bHeight)assert.ok(focusHeight<bHeight,'B+ should be shorter')
    await snapshot('bplus-'+width)
    if(width===1440)await page.locator('.explore-focus').screenshot({path:fileURLToPath(new URL('bplus-focus.png',out))})
    if(width<=760){
      await page.evaluate(()=>scrollTo(0,0));const primary=await page.locator('[data-home-action=primary]').boundingBox(),navTop=(await page.locator('.mobile-primary-nav').boundingBox()).y;assert.ok(primary.y+primary.height<navTop,'primary not in first viewport '+width)
      const ys=[];for(const position of [0,.5,1]){await page.evaluate(f=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f),position);ys.push((await page.locator('.mobile-primary-nav').boundingBox()).y)}assert.ok(Math.max(...ys)-Math.min(...ys)<1,'bottom navigation moved while scrolling')
      for(const target of [page.locator('.bplus-task-list .task-line-action').last(),page.locator('.bplus-course-action'),page.locator('.explore-overview a').last()])await reachable(target)
      await page.screenshot({path:fileURLToPath(new URL('bplus-scrolled-'+width+'.png',out)),fullPage:false})
      measurements.push({width,bHeight,focusHeight,primaryBottom:primary.y+primary.height,bottomNavTop:navTop,scrollNavigationStable:true,targetsReachable:true})
    }else measurements.push({width,bHeight,focusHeight})
  }
  const groups=await page.locator('.bplus-task-group').count(),taskCount=await page.locator('.bplus-task-list [data-task-id]').count();assert.ok(groups<taskCount,'existing same-deadline data should group')
  const course=await page.locator('.bplus-course-action').innerText();assert.ok(course.includes('复习章节'),'existing fully-read course should offer review')
  const courseHref=await page.locator('.bplus-course-action').getAttribute('href');assert.ok(courseHref.includes('/chapter/'))
  await reachable(page.locator('[data-home-action=primary]'));await page.locator('[data-home-action=primary]').focus();await page.keyboard.press('Enter');await page.waitForURL(u=>!u.hash.startsWith('#/student/home'));await ready();await page.goBack();await ready()
  await design('a');assert.equal(await page.locator('[data-design=a]').count(),1);await design('current');assert.equal(await page.locator('.dashboard-page').count(),1)
  assert.deepEqual(requests.filter(r=>r.method!=='GET'&&r.path!=='/api/v1/auth/login'),[]);assert.deepEqual(errors,[])
  writeFileSync(new URL('result.json',out),JSON.stringify({at:new Date().toISOString(),result:'PASS',measurements,groups,taskCount,courseAction:course,coreDataRefetchedOnSwitch:false,primaryCanSubmit:true,keyboardPrimaryNavigation:true,originalAndAPreserved:true,businessWrites:0,browserErrors:errors},null,2))
  console.log('PASS: B+ real task/grouping/chapter review, B height comparison, six viewports, scrolling navigation and reachable actions, keyboard navigation; no business writes.')
}catch(e){console.error(e.message);await page.screenshot({path:fileURLToPath(new URL('failure.png',out)),fullPage:true}).catch(()=>{});throw e}finally{await browser.close()}
