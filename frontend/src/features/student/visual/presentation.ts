/** Explicit subject families; unknown marks retain neutral identity, never infer from title. */
export function subject(mark:string|null|undefined){
 const key=(mark??'').toUpperCase()
 const family=['JAVA','WEB'].includes(key)?'code':['DB','DSA'].includes(key)?'data':['NET','SE'].includes(key)?'systems':['AI','MEDIA'].includes(key)?'explore':'neutral'
 return {family,label:{code:'程序与交互',data:'数据与结构',systems:'系统与工程',explore:'探索与表达',neutral:'课程学习'}[family],mark:mark||'课程'}
}
export function chapterState(status:string|undefined|null){return status==='completed'?'已阅读':status==='in_progress'?'阅读中':status==='not_started'?'尚未阅读':'阅读状态未知'}
export function density(count:number){return count===0?'none':count===1?'one':count===2?'two':'many'}
export function beijingTime(value:string){return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))}
