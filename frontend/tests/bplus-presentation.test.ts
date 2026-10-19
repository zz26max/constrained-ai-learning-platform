import {describe,it,expect} from 'vitest'
import {groupByDeadline,compactDeadline,chapterOverview} from '../src/features/dashboard/bplus-presentation'
import type {AssignmentDetailDTO} from '../src/api/assignments'
import type {ChapterSummaryDTO} from '../src/api/courses'
const task=(id:string,dueAt:string)=>({id,dueAt} as AssignmentDetailDTO)
const chapter=(id:string,number:number,status:string|null,publicationState='published')=>({id,number,publicationState,studentProgress:status?{status}:null} as ChapterSummaryDTO)
describe('B+展示规则',()=>{
  it('相同截止时刻只出现一个组，等价时区合并，组和组内顺序稳定且不改源数组',()=>{
    const items=[task('d','2026-10-25T14:00:00Z'),task('b','2026-10-24T14:00:00Z'),task('a','2026-10-24T22:00:00+08:00'),task('c','2026-10-24T14:00:30Z')]
    const before=items.map(t=>t.id)
    const groups=groupByDeadline(items)
    expect(groups).toHaveLength(3)
    expect(groups[0]?.tasks.map(t=>t.id)).toEqual(['a','b'])
    expect(groups[1]?.tasks.map(t=>t.id)).toEqual(['c'])
    expect(items.map(t=>t.id)).toEqual(before)
  })
  it('北京时间主日期省略当前年，跨年与非整分钟保留必要精度',()=>{
    const now=new Date('2026-10-19T00:00:00Z')
    expect(compactDeadline('2026-10-24T14:00:00Z',now)).toBe('10月24日 22:00')
    expect(compactDeadline('2026-12-31T16:00:00Z',now)).toContain('2027年1月1日')
    expect(compactDeadline('2026-10-24T14:00:30Z',now)).toContain('22:00:30')
    expect(compactDeadline('2026-10-24T14:00:30Z',now,false)).toBe('10月24日 22:00')
  })
  it('全部已开放章节阅读完成不表示整门课程结课；草稿不计入开放章节',()=>{
    const p=chapterOverview([chapter('b',2,'not_started','draft'),chapter('a',1,'completed')])
    expect(p).toMatchObject({total:1,completed:1,percent:100,allRead:true,next:undefined})
  })
  it('只将真实未阅读章节作为下一章，未知与无章节不虚构下一章',()=>{
    expect(chapterOverview([chapter('c',3,'not_started'),chapter('a',1,'completed'),chapter('b',2,'in_progress')]).next?.id).toBe('b')
    expect(chapterOverview([chapter('a',1,null)])).toMatchObject({allRead:false,next:undefined,unknown:true})
    expect(chapterOverview([])).toMatchObject({total:0,allRead:false,next:undefined})
  })
})
