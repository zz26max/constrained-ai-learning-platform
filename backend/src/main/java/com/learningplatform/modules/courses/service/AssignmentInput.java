package com.learningplatform.modules.courses.service;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.FileDTO;
import org.springframework.http.HttpStatus;
/** P1-B 作业输入校验；复用 CourseInput 的通用规则，扩展作业专用校验。 */
public final class AssignmentInput {
    private AssignmentInput() {}
    private static final String UUID_REGEX="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    private static final Set<String> VALID_FILE_PATHS=Set.of("index.html","style.css","script.js","answer.sql","answer.md");
    public static void page(int page,int size) { if(page<1||size<1||size>100) throw invalid(); }
    public static String uuid(String value) {
        if(value==null||!value.matches(UUID_REGEX)) throw invalid();
        return value;
    }
    public static String text(Map<String,Object> body,String name,int max) {
        Object value=body.get(name);
        if(!(value instanceof String text)||text.codePointCount(0,text.length())<1||text.codePointCount(0,text.length())>max) throw invalid();
        return text;
    }
    public static String optionalUuid(Map<String,Object> body,String name) {
        Object value=body.get(name);
        if(value==null) return null;
        if(!(value instanceof String)) throw invalid();
        return uuid((String)value);
    }
    public static Instant timestamp(Map<String,Object> body,String name) {
        String text=text(body,name,40);
        if(!Pattern.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z",text)) throw invalid();
        try { return Instant.parse(text); } catch(RuntimeException exception) { throw invalid(); }
    }
    public static Instant optionalTimestamp(Map<String,Object> body,String name) {
        Object value=body.get(name);
        if(value==null) return null;
        return timestamp(body,name);
    }
    public static int integer(Map<String,Object> body,String name) {
        Object value=body.get(name);
        if(!(value instanceof Number number)||number.longValue()<0||number.longValue()>Integer.MAX_VALUE
                ||number.doubleValue()!=number.longValue()) throw invalid();
        return number.intValue();
    }
    public static boolean bool(Map<String,Object> body,String name) {
        Object value=body.get(name);
        if(!(value instanceof Boolean)) throw invalid();
        return (Boolean)value;
    }
    public static BigDecimal decimal(Map<String,Object> body,String name) {
        Object value=body.get(name);
        if(value instanceof Number number) {
            BigDecimal bd=BigDecimal.valueOf(number.doubleValue());
            if(bd.compareTo(BigDecimal.ZERO)<=0||bd.compareTo(new BigDecimal("9999.99"))>0) throw invalid();
            return bd.setScale(2,java.math.RoundingMode.HALF_UP);
        }
        throw invalid();
    }
    public static BigDecimal optionalDecimal(Map<String,Object> body,String name) {
        Object value=body.get(name);
        if(value==null) return null;
        return decimal(body,name);
    }
    public static List<String> stringList(Map<String,Object> body,String name) {
        Object value=body.get(name);
        if(!(value instanceof List<?> list)) throw invalid();
        List<String> result=new ArrayList<>();
        for(Object item:list) {
            if(!(item instanceof String text)||text.isEmpty()||text.length()>8000) throw invalid();
            result.add(text);
        }
        return result;
    }
    public static List<String> optionalStringList(Map<String,Object> body,String name) {
        Object value=body.get(name);
        if(value==null) return null;
        return stringList(body,name);
    }
    public static List<FileDTO> files(Map<String,Object> body,String name) {
        Object value=body.get(name);
        if(!(value instanceof List<?> list)) throw invalid();
        List<FileDTO> result=new ArrayList<>();
        for(Object item:list) {
            if(!(item instanceof Map<?,?>)) throw invalid();
            @SuppressWarnings("unchecked")
            Map<String,Object> fileMap=(Map<String,Object>)item;
            String path=text(fileMap,"path",64);
            String content=text(fileMap,"content",102400);
            if(!VALID_FILE_PATHS.contains(path)) throw invalid();
            if(content.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>102400) throw invalid();
            result.add(new FileDTO(path,content));
        }
        return result;
    }
    public static String activeFile(Map<String,Object> body,String name) {
        String path=text(body,name,64);
        if(!VALID_FILE_PATHS.contains(path)) throw invalid();
        return path;
    }
    /**
     * 工作区保存请求校验：未知字段 400 INVALID_REQUEST；文件名不在作业类型允许集合 400 INVALID_FILE_PATH；
     * 其余缺失、类型、数量、体积、重复路径等问题 422 VALIDATION_ERROR。content 允许为空串。
     */
    public static void validateWorkspaceWrite(Map<String,Object> body,Set<String> allowedPaths) {
        if(body==null) throw invalid();
        for(String key:body.keySet()) {
            if(!Set.of("baseRevision","files","activeFile").contains(key)) throw invalidRequest();
        }
        requireKeys(body,"baseRevision","files","activeFile");
        integer(body,"baseRevision");
        if(!(body.get("files") instanceof List<?> list)||list.isEmpty()||list.size()>3) throw invalid();
        Set<String> seen=new java.util.HashSet<>();
        long total=0;
        for(Object item:list) {
            if(!(item instanceof Map<?,?> file)) throw invalid();
            for(Object key:file.keySet()) {
                if(!"path".equals(key)&&!"content".equals(key)) throw invalidRequest();
            }
            if(!(file.get("path") instanceof String path)||!(file.get("content") instanceof String content)) throw invalid();
            if(!allowedPaths.contains(path)) throw invalidFilePath();
            if(!seen.add(path)) throw invalid();
            int bytes=content.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
            if(bytes>102400) throw invalid();
            total+=bytes;
        }
        if(total>262144) throw invalid();
        if(!(body.get("activeFile") instanceof String active)) throw invalid();
        if(!allowedPaths.contains(active)) throw invalidFilePath();
        if(!seen.contains(active)) throw invalid();
    }
    /** 已通过 validateWorkspaceWrite 校验的文件列表。 */
    public static List<FileDTO> workspaceFiles(Map<String,Object> body) {
        List<FileDTO> result=new ArrayList<>();
        for(Object item:(List<?>)body.get("files")) {
            Map<?,?> file=(Map<?,?>)item;
            result.add(new FileDTO((String)file.get("path"),(String)file.get("content")));
        }
        return result;
    }
    public static BusinessException invalidRequest() {
        return new BusinessException(HttpStatus.BAD_REQUEST,"INVALID_REQUEST","请求体包含未知字段。");
    }
    public static BusinessException invalidFilePath() {
        return new BusinessException(HttpStatus.BAD_REQUEST,"INVALID_FILE_PATH","文件名不在该作业类型允许的范围内。");
    }
    public static void validateSubmissionWrite(Map<String,Object> body) {
        requireKeys(body,"workspaceRevision","reflection");
        int revision=integer(body,"workspaceRevision");
        if(revision<1) throw invalid();
        text(body,"reflection",8000);
    }
    public static void validateFeedbackWrite(Map<String,Object> body) {
        requireKeys(body,"overallComment","finalScore","rubricScores");
        text(body,"overallComment",8000);
        if(body.get("finalScore")!=null) optionalDecimal(body,"finalScore");
        Object rubricScores=body.get("rubricScores");
        if(rubricScores!=null&&!(rubricScores instanceof List<?>)) throw invalid();
        if(body.containsKey("baseVersion")) integer(body,"baseVersion");
    }
    public static void validateAssignmentWrite(Map<String,Object> body) {
        requireKeys(body,"chapterId","title","description","estimatedMinutes","type","isRequired",
                "dueAt","lateUntil","allowResubmit","maxAttempts","maxScore","requirements","rubric",
                "initialFiles","knowledgePointIds");
        // chapterId 可为 null
        if(body.get("chapterId")!=null) optionalUuid(body,"chapterId");
        text(body,"title",200);
        text(body,"description",8000);
        int estimatedMinutes=integer(body,"estimatedMinutes");
        if(estimatedMinutes<1) throw invalid();
        text(body,"type",16);
        bool(body,"isRequired");
        timestamp(body,"dueAt");
        // lateUntil 可为 null
        bool(body,"allowResubmit");
        int maxAttempts=integer(body,"maxAttempts");
        if(maxAttempts<1) throw invalid();
        decimal(body,"maxScore");
        stringList(body,"requirements");
        // rubric、initialFiles、knowledgePointIds 可为空列表或 null
    }
    public static void validatePatch(Map<String,Object> body,String... allowedFields) {
        if(body==null||body.isEmpty()) throw invalid();
        Set<String> allowed=Set.of(allowedFields);
        for(String key:body.keySet()) {
            if(!allowed.contains(key)) throw invalid();
        }
    }
    public static void empty(Map<String,Object> body) {
        if(body==null||!body.isEmpty()) throw new BusinessException(HttpStatus.BAD_REQUEST,"INVALID_REQUEST","请求体必须为空对象。");
    }
    private static void requireKeys(Map<String,Object> body,String... keys) {
        if(body==null) throw invalid();
        for(String key:keys) {
            if(!body.containsKey(key)) throw invalid();
        }
    }
    public static BusinessException invalid() {
        return new BusinessException(HttpStatus.UNPROCESSABLE_CONTENT,"VALIDATION_ERROR","请求参数不符合要求。");
    }
}
