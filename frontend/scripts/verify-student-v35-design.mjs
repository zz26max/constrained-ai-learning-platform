import {chromium} from 'playwright-core'
import {mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const out=new URL('../.cache/student-v35/',import.meta.url)
for(const dir of ['comparison','details','overview'])mkdirSync(new URL(dir+'/',out),{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'})
const base='http://127.0.0.1:4174/campus.html?explore=v35#',errors=[],network=[],checks=[],contrast=[],metrics=[]
const pages={home:'/student/home',courses:'/course',records:'/student/progress/33000000-0000-4000-8000-000000000100',assignments:'/student/assignments',calendar:'/student/calendar?date=2026-10-24',messages:'/student/messages'}
const labels={home:'学习首页',courses:'我的课程',records:'学习记录',assignments:'我的作业',calendar:'学习日历',messages:'消息通知'}
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))network.push(r.url())})
async function ready(){await page.locator('main h1').waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('main [role=status]')).some(n=>/正在加载|正在读取|正在确认/.test(n.textContent??'')));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await page.locator('main .state-block[role=alert]').count(),0)}
async function go(path,v='v35'){await page.goto(base+path+(path.includes('?')?'&':'?')+'visual='+v);await page.reload();await ready()}
async function snap(name){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL(name+'.png',out)),fullPage:true})}
async function hit(target){if(!await target.count()||!await target.isVisible())return;await target.evaluate(n=>n.scrollIntoView({block:'center'}));assert.ok(await target.evaluate(n=>{const r=n.getBoundingClientRect(),p=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return p===n||n.contains(p)}),'control occluded');assert.ok((await target.boundingBox()).height>=43.5,'control under 44px')}
const lum=rgb=>{const c=rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]}
async function sampleContrast(name,width){
 const samples=await page.locator('.v35-page h1,.v35-page h2,.v35-page h3,.v35-subject,.v35-subject-mark,.v35-task-status span,.v35-task-status small,.v35-deadline span,.v35-deadline strong,.notification-type,.notification-time,.notification-content,.v35-page .task-line-action,.v35-page .feedback-score strong,.v35-page .explore-muted,.v35-page .vx-muted').evaluateAll(ns=>ns.filter(n=>n.getClientRects().length).slice(0,90).map(n=>{let e=n,bg='rgb(255,255,255)';while(e){const c=getComputedStyle(e).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent'){bg=c;break}e=e.parentElement}const style=getComputedStyle(n);return {text:n.textContent?.slice(0,24),fg:style.color,bg,size:parseFloat(style.fontSize),weight:parseInt(style.fontWeight)}}))
 for(const s of samples){const a=lum(s.fg),b=lum(s.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);const minimum=s.size>=24||s.size>=18.7&&s.weight>=700?3:4.5;assert.ok(ratio>=minimum,`${name} contrast ${ratio}: ${s.text}`);contrast.push({name,width,...s,ratio})}
}
try{
 // Both modes use fresh identical memory, clock and default filters.
 let fingerprint
 for(const version of ['v33','v35']){
  await go('/student/home',version)
  const data=await page.evaluate(async()=>{const api=await import('/src/api/index.ts');return JSON.stringify([(await api.coursesApi().listMyCourses({status:'all',page:1,pageSize:100})).data,(await api.assignmentsApi().listMyAssignments({filter:'all',page:1,pageSize:100})).data,(await api.assignmentsApi().listMessages({page:1,pageSize:100})).data])})
  if(fingerprint)assert.equal(data,fingerprint);else fingerprint=data
  for(const [name,path]of Object.entries(pages)){
   await go(path,version)
   for(const width of [1440,1024,430,390,375,320]){
    await page.setViewportSize({width,height:width>760?1000:844});await ready()
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}/${version}/${width} overflow`)
    const controls=page.locator('main a.button,main button:not(:disabled),main .vx-text-action,main .task-line-action,main .explore-course-actions>a')
    await hit(controls.first());await hit(controls.last())
    if(width===1440||width===390){
     await snap(`comparison/${name}-${version}-${width}`)
     if(version==='v35'){
      await snap(`current/${name}-${width===1440?'desktop':'mobile'}`);await sampleContrast(name,width);await page.locator('main').screenshot({path:fileURLToPath(new URL(`overview/${name}-${width===1440?'desktop':'mobile'}.png`,out))})
      const selectors={home:'.explore-focus',courses:'.vx-course-sheet',records:'.vx-path',assignments:'.task-table-row',calendar:'.vx-agenda',messages:'.notification-item'}
      await page.locator(selectors[name]).first().screenshot({path:fileURLToPath(new URL(`details/${name}-${width}.png`,out))})
     }
    }
    if(name==='home')metrics.push({version,width,...await page.locator('[data-home-action=primary]').first().evaluate(n=>{const r=n.getBoundingClientRect();return {actionDocumentY:r.y+scrollY,actionHeight:r.height}})})
    checks.push({name,version,width,overflow:false,controlsReachable:true})
   }
  }
 }
 // Verify real scroll and content hit-testing on all four mobile sizes.
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:844})
  for(const name of ['home','courses','records','assignments','messages']){
   await go(pages[name]);const targets=page.locator('main a.button,main button:not(:disabled),main .vx-text-action,main .task-line-action,main .explore-course-actions>a')
   const count=await targets.count();for(const i of [...new Set([0,Math.floor(count/2),count-1])])if(i>=0)await hit(targets.nth(i))
   const nav=page.getByRole('navigation',{name:'手机主导航',exact:true});if(await nav.count())assert.ok(await nav.isVisible())
  }
  await go('/student/calendar?date=2026-10-24');const date=page.locator('.vx-week-day').filter({hasText:'24'}).first();await hit(date);assert.equal(await page.locator('.vx-agenda-event').count(),3);await hit(page.locator('.vx-agenda-event').last())
  checks.push({scenario:'mobile first/middle/last actions, bottom navigation and date hit testing',width,result:'PASS'})
 }
 await page.setViewportSize({width:390,height:844});await go('/student/home')
 const late=page.locator('[data-home-action=primary]');const lateId=await late.getAttribute('data-task-id');assert.match(await page.locator('.explore-focus').innerText(),/允许补交/)
 await late.click();await ready();const latePermission=await page.evaluate(async id=>(await (await import('/src/api/index.ts')).assignmentsApi().getAssignment(id)).data,lateId);assert.equal(latePermission.canSubmit,true);assert.equal(latePermission.overdue,true);await page.getByRole('link',{name:'进入工作区',exact:true}).click();await ready();assert.equal(await page.locator('textarea.workspace-editor').count(),1);await page.goBack();await ready()
 await page.evaluate(()=>{location.hash='/student/assignments'});await ready();assert.match(await page.locator(`[data-task-id="${lateId}"]`).innerText(),/允许补交/)
 await page.evaluate(()=>{location.hash='/student/calendar?date=2026-10-19'});await ready();assert.match(await page.locator(`[data-task-id="${lateId}"]`).innerText(),/允许补交/)
 checks.push({scenario:'same actual late task qualification agrees across home, detail, assignments and calendar',result:'PASS'})
 // Version/reference history remains interactive and preserves URL date/view.
 await go('/student/calendar?date=2026-10-24&view=week');await page.getByLabel('历史设计参考').selectOption('v341');await ready();assert.match(page.url(),/view=week/);assert.equal(await page.locator('.v35-page').count(),0)
 await page.getByLabel('历史设计参考').selectOption('v34');await ready();assert.equal(await page.locator('.vx-refined').count(),0)
 await page.getByRole('button',{name:'V3.5 候选',exact:true}).click();await ready();assert.equal(await page.locator('.v35-page').count(),1)
 checks.push({scenario:'V3.4/V3.4.1 history remains unchanged and date/view survive version switch',result:'PASS'})
 await go('/student/progress/33000000-0000-4000-8000-000000000100');assert.equal(await page.locator('.v35-node-check').count(),2);assert.equal(await page.locator('[data-state=completed] .vx-path-node>span').first().innerText(),'01');assert.equal((await page.locator('[data-state=in_progress] .vx-text-action').innerText()).replace(/\s/g,''),'继续阅读↗');assert.equal((await page.locator('[data-state=not_started] .vx-text-action').innerText()).replace(/\s/g,''),'开始阅读↗')
 await page.locator('[data-state=completed] .vx-text-action').first().click();await ready();await page.goBack();await ready()
 checks.push({scenario:'completed chapter retains numeral/check/text; actual begin, continue and review wording',result:'PASS'})
 // Explicit rendering fixtures below never change normal demo source data.
 async function inject(code,path){await go('/student/home');await page.evaluate(code);await page.evaluate(p=>{location.hash=p},path);await ready()}
 await inject(async()=>{const api=(await import('/src/api/index.ts')).assignmentsApi(),original=api.listMyAssignments.bind(api);api.listMyAssignments=async(...args)=>{const r=await original(...args);for(const item of r.data.items)item.title+='：独立边界测试，复杂校园系统中的设计实现与验证'.repeat(5);return r}},'/student/assignments')
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await hit(page.locator('.task-table-row .button').last());await snap('details/long-assignment')
 await inject(async()=>{const api=(await import('/src/api/index.ts')).coursesApi(),original=api.listMyCourses.bind(api);api.listMyCourses=async(...args)=>{const r=await original(...args);for(const item of r.data.items)item.title+='：独立长名称与跨学科学习内容验证'.repeat(3);return r}},'/student/assignments')
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await snap('details/long-course')
 await inject(async()=>{const api=(await import('/src/api/index.ts')).assignmentsApi(),original=api.listMessages.bind(api);api.listMessages=async(q,...opts)=>{const r=await original({...q,page:1},...opts),seed=r.data.items;const all=Array.from({length:45},(_,i)=>({...structuredClone(seed[i%seed.length]),id:'66000000-0000-4000-8000-'+String(i).padStart(12,'0'),title:'独立消息分页边界 '+i+' '+seed[i%seed.length].title}));r.data.items=all.slice(((q?.page??1)-1)*20,(q?.page??1)*20);r.data.total=45;return r}},'/student/messages')
 assert.equal(await page.locator('.notification-item').count(),20);await hit(page.getByRole('button',{name:'下一页',exact:true}));await page.getByRole('button',{name:'下一页',exact:true}).click();await ready();await page.getByRole('button',{name:'下一页',exact:true}).click();await ready();assert.equal(await page.locator('.notification-item').count(),5);await snap('details/messages-page3')
 checks.push({scenario:'isolated long task/course and 45-message pagination rendering fixtures',result:'PASS'})
 await inject(async()=>{const api=(await import('/src/api/index.ts')).assignmentsApi(),original=api.listMessages.bind(api);api.listMessages=async(...args)=>{const r=await original(...args);r.data.items=[];r.data.total=0;r.data.summary.unreadCount=0;return r}},'/student/messages');assert.match(await page.locator('main').innerText(),/暂无消息/);await snap('details/empty-messages')
 await inject(async()=>{const api=(await import('/src/api/index.ts')).assignmentsApi(),original=api.listMyAssignments.bind(api);api.listMyAssignments=async(...args)=>{const r=await original(...args);r.data.items=[];r.data.total=0;return r}},'/student/assignments');assert.match(await page.locator('main').innerText(),/暂无符合条件的作业/);await snap('details/empty-assignments')
 await go('/student/home');await page.evaluate(async()=>{const api=(await import('/src/api/index.ts')).assignmentsApi(),original=api.listMyAssignments.bind(api);api.listMyAssignments=async(...args)=>{const r=await original(...args);r.data.items=[];r.data.total=0;return r}});await page.evaluate(()=>{location.hash='/student/assignments'});await ready();await page.evaluate(()=>{location.hash='/student/home'});await ready();assert.match(await page.locator('.explore-focus').innerText(),/当前没有可提交的待办/);await hit(page.locator('[data-home-action=primary]'));await snap('details/empty-home')
 checks.push({scenario:'successful empty task, message and no-actionable-home states',result:'PASS'})
 await go('/student/messages');const full=page.locator('.message-full').first();const item=full.locator('..');const itemId=await item.getAttribute('data-message-id');await full.locator('summary').click();assert.notEqual(await full.getAttribute('open'),null);assert.equal(await page.locator(`[data-message-id="${itemId}"]`).evaluate(n=>n.classList.contains('unread')),true);await snap('details/message-expanded');await full.locator('summary').click();await item.getByRole('button',{name:'标为已读',exact:true}).click();await ready();assert.equal(await page.locator(`[data-message-id="${itemId}"]`).evaluate(n=>n.classList.contains('unread')),false)
 checks.push({scenario:'message expand does not mark read, explicit mark read updates memory',result:'PASS'})
 // Rendering failure keeps unknown qualification and never grants submission.
 await go('/student/home');await page.evaluate(async()=>{(await import('/src/api/index.ts')).assignmentsApi().getAssignment=async()=>{throw new Error('独立V3.5资格故障')}});await page.evaluate(()=>{location.hash='/student/assignments'});await page.getByText('提交资格未能完整加载',{exact:false}).waitFor();assert.match(await page.locator('.task-table-row').first().innerText(),/提交资格未确认/);assert.equal(await page.locator('.task-table-row .v35-qualification').filter({hasText:'允许补交'}).count(),0);await snap('details/eligibility-error')
 checks.push({scenario:'qualification failure stays unknown without fabricated success',result:'PASS'})
 for(const name of ['home','assignments','messages']){
  await go(pages[name]);await page.evaluate(()=>{const ns=[...document.querySelectorAll('main *')].map(n=>[n,parseFloat(getComputedStyle(n).fontSize),parseFloat(getComputedStyle(n).lineHeight)]);for(const [n,f,l]of ns){n.style.setProperty('font-size',f*2+'px','important');if(l)n.style.setProperty('line-height',l*2+'px','important')}})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} 200% overflow`);await hit(page.locator('main a.button,main button:not(:disabled)').last());await snap('details/text-200-'+name)
  checks.push({name,scenario:'200% text/line-height and last action',result:'PASS'})
 }
 assert.deepEqual(errors,[]);assert.deepEqual(network,[])
 writeFileSync(new URL('design-result.json',out),JSON.stringify({checks,metrics,contrast,errors,network},null,2))
 // Standalone review sheets use actual screenshots, preserving their original files.
 const sheet=(size)=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{font:18px/1.5 system-ui;background:#eef2f8;color:#192c4d;margin:28px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}section{background:white;padding:12px}h2{font-size:20px;margin:0 0 10px}figure{height:${size==='desktop'?520:850}px;margin:0;overflow:hidden}img{width:100%;height:auto;display:block;margin-top:${size==='mobile'?'-62.82%':'0'}}a{color:#2853bc}</style><h1>知学 V3.5 · 六页${size==='desktop'?'桌面':'手机'}视觉评审</h1><p>同一虚拟日期与原始演示数据 · 下图为首段缩略裁切（手机略去公共演示栏），点击查看完整截图</p><div class="grid">${Object.keys(pages).map(n=>`<section><h2>${labels[n]}</h2><a href="../current/${n}-${size}.png"><figure><img src="../current/${n}-${size}.png"></figure></a></section>`).join('')}</div></html>`
 for(const size of ['desktop','mobile']){
  writeFileSync(new URL(`overview/${size}.html`,out),sheet(size));await page.setViewportSize({width:1800,height:1600});await page.goto(new URL(`overview/${size}.html`,out).href);await page.locator('img').last().waitFor();await page.screenshot({path:fileURLToPath(new URL(`overview/${size}.png`,out)),fullPage:true})
 }
 const cards=Object.keys(pages).map(n=>`<section><h2>${labels[n]}</h2>${[1440,390].map(w=>`<h3>${w===1440?'桌面':'手机'}</h3><div class="pair">${['v33','v35'].map(v=>`<a href="comparison/${n}-${v}-${w}.png"><strong>${v.toUpperCase()}</strong><img src="comparison/${n}-${v}-${w}.png" loading="lazy"></a>`).join('')}</div>`).join('')}</section>`).join('')
 writeFileSync(new URL('index.html',out),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.7 system-ui;background:#f4f6fb;color:#192c4d;margin:28px}main{max-width:1440px;margin:auto}section{background:white;padding:24px;margin:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}a{color:#2853bc}img{width:100%;height:550px;object-fit:contain;object-position:top}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><main><h1>知学 V3.5 · 学生体验整合候选</h1><p>固定2026-10-19 10:00北京时间；同数据同视口。未替换正式页面。</p><p><a href="overview/desktop.html">六页桌面整体评审</a> · <a href="overview/mobile.html">六页手机整体评审</a> · <a href="design-result.json">视觉/边界检查</a> · <a href="result.json">12条模拟流程</a></p>${cards}<section><h2>边界截图</h2>${['long-assignment','long-course','messages-page3','empty-home','empty-assignments','empty-messages','message-expanded','eligibility-error','text-200-home','text-200-assignments','text-200-messages'].map(n=>`<p><a href="details/${n}.png">${n}</a></p>`).join('')}<p>边界渲染夹具只在测试中注入，不改变正常演示数据。</p></section></main></html>`)
 console.log(`PASS: V3.5 ${checks.length} design checks; ${contrast.length} text samples; min ${Math.min(...contrast.map(s=>s.ratio)).toFixed(2)}:1; no real API calls`)
}catch(error){console.error('FAILED',page.url());await snap('failure-design');throw error}finally{await browser.close()}
