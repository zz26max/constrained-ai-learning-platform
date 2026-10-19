export const DEMO_NOW='2026-10-19T02:00:00.000Z'
export const DEMO_EPOCH=Date.parse(DEMO_NOW)
export const at=(hours:number)=>new Date(DEMO_EPOCH+hours*3600000).toISOString()
/** Virtual clock is installed only by the standalone preview entry, never the real app. */
export function installCampusClock(){
 const NativeDate=globalThis.Date
 globalThis.Date=new Proxy(NativeDate,{
  construct(Target,args){return Reflect.construct(Target,args.length?args:[DEMO_EPOCH])},
  apply(){return new NativeDate(DEMO_EPOCH).toString()},
  get(Target,key){return key==='now'?()=>DEMO_EPOCH:Reflect.get(Target,key)},
 })
}
