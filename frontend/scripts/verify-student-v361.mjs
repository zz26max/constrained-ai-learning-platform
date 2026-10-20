import {chromium} from 'playwright-core'
import {mkdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const out='frontend/.cache/student-v361';mkdirSync(out,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});const checks=[],network=[],errors=[]
page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))network.push(r.url())});page.on('pageerror',e=>errors.push(e.message))
async function go(name,version='v361',unread='a'){await page.goto(`http://127.0.0.1:4174/campus.html?explore=v361#/student/${name}?visual=${version}&unread=${unread}`);await page.locator('main h1').waitFor();await page.evaluate(()=>scrollTo(0,0));await page.waitForFunction(()=>!Array.from(document.querySelectorAll('main [role=status]')).some(n=>/正在加载|正在读取|正在确认提交资格/.test(n.textContent??'')));assert.equal(await page.locator('main .state-block[role=alert]').count(),0)}
try{
for(const width of [1440,1024,768,430,390,375,320])for(const name of ['home','assignments','messages']){
 await page.setViewportSize({width,height:width>760?1000:844});await go(name)
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} ${width} overflow`)
 const samples=[]
 for(const fraction of [0,.5,1]){await page.evaluate(f=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f),fraction);await page.waitForTimeout(80);samples.push(await page.evaluate(()=>({scroll:scrollY,height:innerHeight,nav:[...document.querySelectorAll('nav')].filter(n=>getComputedStyle(n).position==='fixed').map(n=>{const r=n.getBoundingClientRect();return{top:r.top,bottom:r.bottom}})})))}
 const controls=page.locator('main a.button,main button:not(:disabled),main summary');const n=await controls.count();for(const i of [...new Set([0,Math.floor(n/2),n-1])])if(i>=0){const c=controls.nth(i);await c.evaluate(n=>n.scrollIntoView({block:'center'}));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.ok(await c.evaluate(n=>{const r=n.getBoundingClientRect(),h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return n===h||n.contains(h)}),`${name} ${width} covered control: ${await c.innerText()}`)}
 if(width<=760){for(const sample of samples)for(const nav of sample.nav)assert.ok(Math.abs(nav.bottom-sample.height)<2,'fixed nav bottom');const more=page.getByRole('button',{name:'更多导航',exact:true});await more.click();assert.equal(await more.getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await more.getAttribute('aria-expanded'),'false')}
 const metrics=await controls.evaluateAll(ns=>ns.map(n=>({text:n.textContent.trim(),height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width})))
 for(const m of metrics)assert.ok(m.height>=43.5,'touch height '+m.text)
 const fonts=await page.locator('main .task-title,main .notification-title,main .notification-content,main .notification-time').evaluateAll(ns=>ns.map(n=>({role:n.className,font:getComputedStyle(n).fontSize,line:getComputedStyle(n).lineHeight})))
 checks.push({name,width,overflow:false,scroll:samples,controlsReachable:true,metrics,fonts})
 if(width===1440||width===390){for(const v of ['v36','v361']){await go(name,v);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/${name}-${width}-${v}.png`,fullPage:true})}await page.screenshot({path:`${out}/${name}-${width}-viewport.png`})}
}
for(const width of [1440,390]){await page.setViewportSize({width,height:width===1440?1000:844});let original;for(const variant of ['a','b']){await go('messages','v361',variant);const ids=await page.locator('[data-message-id]').evaluateAll(ns=>ns.map(n=>n.dataset.messageId));if(original)assert.deepEqual(ids,original);else original=ids;await page.locator('.notification-item').first().screenshot({path:`${out}/unread-${width}-${variant}.png`,style:'.campus-marker-stack,.mobile-primary-nav,.workspace-topbar{visibility:hidden!important}'})}}
await go('home');assert.match(await page.locator('.explore-focus').innerText(),/已逾期，可补交/);const id=await page.locator('[data-home-action=primary]').getAttribute('data-task-id');await page.locator('[data-home-action=primary]').click();await page.getByRole('link',{name:'进入工作区',exact:true}).waitFor();checks.push({scenario:'late recommended task retains detail/workspace entry',id})
await go('messages');const full=page.locator('.message-full').first();await full.locator('summary').click();assert.notEqual(await full.getAttribute('open'),null);await full.locator('summary').click();assert.equal(await full.getAttribute('open'),null);const read=page.getByRole('button',{name:'标为已读',exact:true});const before=await read.count();await read.first().click();await page.waitForFunction(count=>document.querySelectorAll('.notification-actions button').length<count,await page.locator('.notification-actions button').count()+1).catch(()=>{});assert.equal(await read.count(),before-1);checks.push({scenario:'message expand/collapse/explicit read',result:'PASS'})
assert.deepEqual(network,[]);assert.deepEqual(errors,[])
writeFileSync(`${out}/results.json`,JSON.stringify({checks,network,errors},null,2));console.log(`PASS ${checks.length} checks; API requests 0; page errors 0`)
}finally{await browser.close()}
