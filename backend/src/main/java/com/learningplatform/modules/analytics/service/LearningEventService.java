package com.learningplatform.modules.analytics.service;

import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.analytics.mapper.LearningEventMapper;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.mapper.*;
import com.learningplatform.modules.courses.service.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Service
public class LearningEventService {
    private final LearningEventMapper mapper;
    private final CourseAccess access;
    private final AssignmentMapper assignments;
    private final CourseMapper courses;
    private final JsonMapper json;
    private final Clock clock;
    public LearningEventService(LearningEventMapper mapper,CourseAccess access,AssignmentMapper assignments,CourseMapper courses,JsonMapper json,Clock clock) {
        this.mapper=mapper;this.access=access;this.assignments=assignments;this.courses=courses;this.json=json;this.clock=clock;
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public Map<String,Integer> record(UserDTO user,Map<String,Object> body) {
        CourseAccess.role(user,"student");
        if(body==null||!body.keySet().equals(Set.of("events"))) throw AssignmentInput.invalidRequest();
        if(!(body.get("events") instanceof List<?> events)||events.isEmpty()||events.size()>50) throw AssignmentInput.invalid();
        Instant received=clock.instant().truncatedTo(ChronoUnit.MICROS);
        int accepted=0,duplicate=0;
        for(Object item:events) {
            if(!(item instanceof Map<?,?> event)) throw AssignmentInput.invalid();
            if(!Set.of("eventId","sessionId","occurredAt","offeringId","assignmentId","chapterId","type","payload").containsAll(event.keySet())) throw AssignmentInput.invalidRequest();
            String id=uuid(event.get("eventId")),session=uuid(event.get("sessionId")),offering=uuid(event.get("offeringId"));
            access.requireStudent(user,offering,true);
            String assignment=event.containsKey("assignmentId")?uuid(event.get("assignmentId")):null;
            String chapter=event.containsKey("chapterId")?uuid(event.get("chapterId")):null;
            var a=assignment==null?null:assignments.findAssignment(assignment);
            if(assignment!=null&&(a==null||!offering.equals(a.offeringId())||a.publishedAt()==null)) throw CourseAccess.notFound();
            if(chapter!=null) {var c=courses.chapter(chapter);if(c==null||!offering.equals(c.offeringId())||!"published".equals(c.status())) throw CourseAccess.notFound();}
            if(a!=null&&chapter!=null&&!chapter.equals(a.chapterId())) throw AssignmentInput.invalid();
            if(!(event.get("type") instanceof String type)||!(event.get("payload") instanceof Map<?,?> payload)) throw AssignmentInput.invalid();
            switch(type) {
                case "chapter_opened" -> {if(chapter==null||!payload.isEmpty()) throw AssignmentInput.invalid();}
                case "resource_opened" -> {
                    if(!payload.keySet().equals(Set.of("resourceId"))) throw AssignmentInput.invalid();
                    var r=courses.resource(uuid(payload.get("resourceId")));
                    if(r==null||!offering.equals(r.offeringId())||!"active".equals(r.status())||(chapter!=null&&!chapter.equals(r.chapterId()))) throw CourseAccess.notFound();
                    var rc=courses.chapter(r.chapterId());if(rc==null||!"published".equals(rc.status())) throw CourseAccess.notFound();
                }
                case "editor_opened" -> {
                    if(a==null||!payload.keySet().equals(Set.of("activeFile"))) throw AssignmentInput.invalid();
                    Set<String> files=switch(a.type()){case "web_lab"->Set.of("index.html","style.css","script.js");case "sql_text"->Set.of("answer.sql");default->Set.of("answer.md");};
                    if(!(payload.get("activeFile") instanceof String file)||!files.contains(file)) throw AssignmentInput.invalid();
                }
                case "preview_opened" -> {if(a==null||!payload.keySet().equals(Set.of("viewport"))||!(payload.get("viewport") instanceof String viewport)||!Set.of("desktop","mobile").contains(viewport)) throw AssignmentInput.invalid();}
                default -> throw AssignmentInput.invalid();
            }
            Instant occurred;
            try {String value=(String)event.get("occurredAt");if(value==null||!value.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z")) throw new IllegalArgumentException();occurred=Instant.parse(value);}
            catch(Exception e) {throw AssignmentInput.invalidField("occurredAt","必须为 UTC 时间。");}
            if(occurred.isBefore(received.minus(24,ChronoUnit.HOURS))||occurred.isAfter(received.plus(5,ChronoUnit.MINUTES))) throw AssignmentInput.invalidField("occurredAt","超出允许的时间范围。");
            String canonical=json.writeValueAsString(canonical(event));
            String existing=mapper.clientPayload(user.id(),id);
            if(existing!=null) {if(!json.readTree(existing).equals(json.readTree(canonical))) throw conflict();duplicate++;continue;}
            var row=row(user.id(),offering,assignment,chapter,type,occurred,received,canonical);
            row.put("eventId",id);row.put("sessionId",session);row.put("source","client");
            try {mapper.insert(row);accepted++;}
            catch(org.springframework.dao.DuplicateKeyException e) {
                existing=mapper.clientPayload(user.id(),id);
                if(existing==null) throw e;
                if(!json.readTree(existing).equals(json.readTree(canonical))) throw conflict();duplicate++;
            }
        }
        return Map.of("acceptedCount",accepted,"duplicateCount",duplicate);
    }
    private static Object canonical(Object value) {
        if(value instanceof Map<?,?> map) {var sorted=new TreeMap<String,Object>();map.forEach((k,v)->sorted.put(k.toString(),canonical(v)));return sorted;}
        if(value instanceof List<?> list) return list.stream().map(LearningEventService::canonical).toList();
        return value;
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public int purgeExpiredClients() {return mapper.purgeClients(clock.instant().minus(90,ChronoUnit.DAYS));}
    private static String uuid(Object value) {if(!(value instanceof String s)) throw AssignmentInput.invalid();return AssignmentInput.uuid(s);}
    private static BusinessException conflict() {return new BusinessException(HttpStatus.CONFLICT,"EVENT_CONFLICT","同一事件 ID 对应不同正文。");}
    private Map<String,Object> row(String user,String offering,String assignment,String chapter,String type,Instant occurred,Instant received,String payload) {
        var row=new HashMap<String,Object>();row.put("id",UUID.randomUUID().toString());row.put("userId",user);row.put("offeringId",offering);row.put("assignmentId",assignment);row.put("chapterId",chapter);row.put("type",type);row.put("occurredAt",occurred);row.put("receivedAt",received);row.put("payload",payload);return row;
    }
    @Transactional(isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public void server(String userId,String offeringId,String assignmentId,String chapterId,String type,String sourceKey,Instant now) {
        if(mapper.sourceExists(sourceKey)>0) return;
        var row=row(userId,offeringId,assignmentId,chapterId,type,now,now,"{}");row.put("source","server");row.put("sourceKey",sourceKey);
        try {mapper.insert(row);} catch(org.springframework.dao.DuplicateKeyException e) {if(mapper.sourceExists(sourceKey)==0) throw e;}
    }
}
