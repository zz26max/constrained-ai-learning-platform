import { describe, expect, it } from 'vitest'
import { ApiClient } from '../src/api/client'
import { AssignmentsApi } from '../src/api/assignments'
import { allPages } from '../src/api/pagination'
import { reviewQueue } from '../src/features/assignments/review-queue'
import { createScriptedTransport, okEnvelope } from './helpers'

describe('完整分页与批阅队列',()=>{
  it('缺失total的旧响应立即失败，不持续翻页',async()=>{
    const scripted=createScriptedTransport(),api=new AssignmentsApi(new ApiClient(scripted.transport))
    scripted.setHandler(()=>okEnvelope({items:[{id:'one',feedbackStatus:'none',superseded:false}]}))
    await expect(reviewQueue(api,'assignment','',true,'one',new AbortController().signal)).rejects.toThrow('total')
    expect(scripted.requests).toHaveLength(1)
  })
  it('跨页聚合，不截断到第一百项',async()=>{
    const rows=Array.from({length:205},(_,i)=>i)
    const pages:number[]=[]
    const result=await allPages(async(page,size)=>{pages.push(page);return {items:rows.slice((page-1)*size,page*size),total:rows.length}},new AbortController().signal)
    expect(result).toEqual(rows); expect(pages).toEqual([1,2,3])
  })
  it('分页失败或提前空页不返回部分成功',async()=>{
    await expect(allPages(async(page)=>{if(page===2) throw new Error('offline');return {items:[1],total:2}},new AbortController().signal)).rejects.toThrow('offline')
    await expect(allPages(async(page)=>({items:page===1?[1]:[],total:2}),new AbortController().signal)).rejects.toThrow('未能完整读取')
  })
  it('中止后不返回旧结果',async()=>{
    const c=new AbortController()
    await expect(allPages(async()=>{c.abort();return {items:[1],total:1}},c.signal)).rejects.toThrow()
  })
  it('保持服务端顺序，排除已发布和已替代提交，从当前份开始跨页',async()=>{
    const scripted=createScriptedTransport(), api=new AssignmentsApi(new ApiClient(scripted.transport))
    const rows=Array.from({length:103},(_,i)=>({id:String(i),feedbackStatus:i===1?'published':i===2?'draft':'none',superseded:i===3}))
    scripted.setHandler(request=>{const q=new URL(request.path,'http://localhost').searchParams;const p=Number(q.get('page'));return okEnvelope({items:rows.slice((p-1)*100,p*100),total:103,page:p,pageSize:100})})
    const ids=await reviewQueue(api,'assignment','',true,'101',new AbortController().signal)
    expect(ids.slice(0,4)).toEqual(['101','102','0','2']);expect(ids).not.toContain('1');expect(ids).not.toContain('3');expect(ids).toHaveLength(101)
    expect(scripted.requests).toHaveLength(2)
    expect(await reviewQueue(api,'assignment','published',true,'1',new AbortController().signal)).toEqual([])
  })
})
