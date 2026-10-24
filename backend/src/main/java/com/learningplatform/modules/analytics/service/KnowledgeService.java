package com.learningplatform.modules.analytics.service;

import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import com.learningplatform.modules.analytics.mapper.KnowledgeMapper;
import com.learningplatform.modules.analytics.mapper.KnowledgeMapper.*;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.KnowledgeSnapshot;
import com.learningplatform.modules.courses.mapper.*;
import com.learningplatform.modules.courses.model.AssignmentRows.Submission;
import com.learningplatform.modules.courses.service.AssignmentInput;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Service
public class KnowledgeService {
    private final KnowledgeMapper mapper;
    private final AssignmentMapper assignments;
    private final CourseMapper courses;
    private final IssueTagService tags;
    private final Clock clock;
    private final JsonMapper json;
    public KnowledgeService(KnowledgeMapper mapper,AssignmentMapper assignments,CourseMapper courses,IssueTagService tags,Clock clock,JsonMapper json) {
        this.mapper=mapper;this.assignments=assignments;this.courses=courses;this.tags=tags;this.clock=clock;this.json=json;
    }
    public List<KnowledgeSnapshot> snapshot(Submission s) {
        var frozen=mapper.snapshot(s.id());
        // Legacy P1 submissions have no frozen knowledge definitions; preserve the documented legacy read limitation.
        return frozen.isEmpty()?assignments.listKnowledgeSnapshots(s.assignmentId()):frozen;
    }
    public void freeze(String submission,String assignment) {mapper.freeze(submission,assignment);}
    public List<Object> evaluations(String feedback) {return new ArrayList<>(mapper.evaluations(feedback));}
    public List<String> issueTags(String feedback) {return mapper.tags(feedback);}
    public Integer issueTagVersion(String feedback) {return mapper.tagVersion(feedback);}
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public void save(String feedback,Submission s,Map<String,Object> body) {
        var allowed=new HashSet<String>();snapshot(s).forEach(k->allowed.add(k.id()));
        var evaluations=new ArrayList<Evaluation>();var seen=new HashSet<String>();
        for(Object item:(List<?>)body.get("knowledgeEvaluations")) {
            if(!(item instanceof Map<?,?> e)) throw AssignmentInput.invalid();
            if(!e.keySet().equals(Set.of("knowledgePointId","result","note"))) throw AssignmentInput.invalidRequest();
            if(!(e.get("knowledgePointId") instanceof String id)||!allowed.contains(id)||!seen.add(id)) throw AssignmentInput.invalidField("knowledgeEvaluations","知识点须属于提交快照且不重复。");
            if(!(e.get("result") instanceof String result)||!Set.of("meets_expectation","needs_practice","insufficient_evidence").contains(result)||!(e.get("note") instanceof String note)||note.codePointCount(0,note.length())>8000) throw AssignmentInput.invalid();
            evaluations.add(new Evaluation(id,result,note));
        }
        var issueTags=new ArrayList<String>();
        Object raw=body.getOrDefault("issueTags",List.of());
        if(!(raw instanceof List<?> list)) throw AssignmentInput.invalid();
        for(Object item:list) {if(!(item instanceof String tag)||tag.isEmpty()||tag.length()>64) throw AssignmentInput.invalid();issueTags.add(tag);}
        Integer version=issueTags.isEmpty()?null:tags.validate(s.offeringId(),issueTags);
        mapper.deleteEvaluations(feedback);mapper.deleteTags(feedback);
        for(var e:evaluations) mapper.evaluation(feedback,e.knowledgePointId(),e.result(),e.note());
        for(String tag:issueTags) mapper.tag(feedback,tag);
        mapper.tagVersionWrite(feedback,version);
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public void published(String feedback,Submission s,int version,Instant now) {
        if(mapper.sourceCount(feedback)>0) return;
        for(var e:mapper.evaluations(feedback)) {
            mapper.supersede(s.studentId(),s.assignmentId(),e.knowledgePointId());
            mapper.evidence(UUID.randomUUID().toString(),s.studentId(),s.offeringId(),e.knowledgePointId(),s.assignmentId(),s.id(),feedback,version,e.result(),e.note(),now);
        }
    }
    public record Analysis(List<Object> assessments,Object recommendation,int needsPracticeCount) {}
    public Analysis analyze(String student,String offering) {
        Instant asOf=clock.instant().truncatedTo(ChronoUnit.MICROS);
        var assessments=new ArrayList<Object>();var candidates=new ArrayList<Map<String,Object>>();int needs=0;
        for(var point:courses.knowledgePoints(offering,null)) {
            var chapter=point.chapterId()==null?null:courses.chapter(point.chapterId());
            if(chapter!=null&&!"published".equals(chapter.status())) continue;
            var evidence=mapper.recent(student,offering,point.id());
            String state=state(evidence,mapper.inProgress(student,offering,point.id())>0);
            if(state.equals("needs_practice")) needs++;
            Instant latest=evidence.isEmpty()?null:evidence.get(0).occurredAt();
            String freshness=latest==null?"none":latest.isBefore(asOf.minus(90,ChronoUnit.DAYS))?"stale":"fresh";
            String explanation=switch(state) {
                case "basically_mastered"->"最近三个不同作业中至少两项符合教师要求。";
                case "needs_practice"->"最近教师评价指出需要巩固。";
                case "learning"->"有关联任务正在进行，尚不构成掌握证据。";
                default->evidence.size()==1&&evidence.get(0).result().equals("meets_expectation")?"已有一次符合要求记录，尚需另一项任务佐证。":"尚无足够教师证据，不能据此判断未掌握。";
            };
            if(freshness.equals("stale")) explanation+=" 当前展示历史证据，请补充近期任务表现。";
            var view=new LinkedHashMap<String,Object>();view.put("knowledgePointId",point.id());view.put("title",point.title());view.put("assessmentState",state);view.put("ruleVersion","knowledge-v2");view.put("asOf",asOf);view.put("latestEvidenceAt",latest);view.put("evidenceCount",evidence.size());view.put("freshness",freshness);view.put("evidenceIds",evidence.stream().map(Evidence::id).toList());view.put("explanation",explanation);view.put("evidence",evidence);assessments.add(view);
            if(!state.equals("basically_mastered")||freshness.equals("stale")) candidates.add(view);
        }
        candidates.sort(Comparator.<Map<String,Object>,Boolean>comparing(v->!v.get("assessmentState").equals("needs_practice"))
                .thenComparing(v->(Instant)v.get("latestEvidenceAt"),Comparator.nullsLast(Comparator.reverseOrder())).thenComparing(v->(String)v.get("knowledgePointId")));
        Object recommendation=null;
        if(!candidates.isEmpty()) {
            var selected=candidates.get(0);String knowledge=(String)selected.get("knowledgePointId");
            String task=mapper.task(student,offering,knowledge),resource=mapper.resource(offering,knowledge);
            var target=Map.of("type",task!=null?"assignment":resource!=null?"resource":"offering","id",task!=null?task:resource!=null?resource:offering,"offeringId",offering);
            var r=new LinkedHashMap<String,Object>();r.put("knowledgePointId",knowledge);r.put("title",selected.get("title"));r.put("reason",selected.get("explanation")+(task==null?" 可复习已有课程材料。":" 建议在关联任务中补充证据。"));
            @SuppressWarnings("unchecked") var e=(List<Evidence>)selected.get("evidence");
            r.put("sourceFeedbackId",e.isEmpty()?null:e.get(0).feedbackId());r.put("evidenceIds",selected.get("evidenceIds"));r.put("target",target);recommendation=r;
        }
        return new Analysis(assessments,recommendation,needs);
    }
    public static String state(List<Evidence> evidence,boolean inProgress) {
        if(!evidence.isEmpty()) {
            String latest=evidence.get(0).result();
            if(latest.equals("insufficient_evidence")) return "insufficient_evidence";
            if(latest.equals("needs_practice")) return "needs_practice";
            if(evidence.stream().filter(e->e.result().equals("meets_expectation")).map(Evidence::assignmentId).distinct().count()>=2) return "basically_mastered";
        }
        return inProgress?"learning":"insufficient_evidence";
    }
    public int pendingHelp(String offering) {return mapper.pendingHelp(offering);}
    @SuppressWarnings("unchecked")
    public List<Object> commonIssues(String assignment,String offering) {
        var config=tags.configuration(offering);int current=((Number)config.get("version")).intValue();
        var confirmed=mapper.confirmed(assignment);var reported=mapper.reported(assignment);var result=new ArrayList<Object>();
        for(Object item:(List<?>)config.get("items")) {
            var tag=(Map<String,Object>)item;String code=(String)tag.get("tag");
            var c=new HashSet<String>();var r=new HashSet<String>();var times=new ArrayList<Instant>();
            for(var row:confirmed) if(code.equals(row.get("tag"))&&row.get("version") instanceof Number n&&n.intValue()==current) {c.add((String)row.get("studentId"));times.add(instant(row.get("occurredAt")));}
            for(var row:reported) if(row.get("version") instanceof Number n&&n.intValue()==current&&json.readValue(row.get("tags").toString(),List.class).contains(code)) {r.add((String)row.get("studentId"));times.add(instant(row.get("occurredAt")));}
            var union=new HashSet<>(c);union.addAll(r);if(union.isEmpty()) continue;
            var sources=new ArrayList<String>();if(!r.isEmpty()) sources.add("student_help");if(!c.isEmpty()) sources.add("teacher_feedback");
            var issue=new LinkedHashMap<String,Object>();issue.put("issueTag",code);issue.put("title",tag.get("title"));issue.put("reportedStudentCount",r.size());issue.put("confirmedStudentCount",c.size());issue.put("distinctStudentCount",union.size());issue.put("description","按当前词表版本 "+current+" 汇总；学生自报与教师确认分别计数。");issue.put("sources",sources);issue.put("timeRange",Map.of("from",Collections.min(times),"to",Collections.max(times)));issue.put("knowledgePointId",null);result.add(issue);
        }
        return result;
    }
    private static Instant instant(Object value) {if(value instanceof Instant i)return i;if(value instanceof java.sql.Timestamp t)return t.toInstant();if(value instanceof LocalDateTime t)return t.toInstant(ZoneOffset.UTC);throw new IllegalStateException("Unsupported database timestamp");}
}
