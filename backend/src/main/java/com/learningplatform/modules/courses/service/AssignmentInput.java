package com.learningplatform.modules.courses.service;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import com.learningplatform.common.exception.BusinessException;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.FileDTO;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.RubricCriterion;
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
    private static final Set<String> WRITE_FIELDS=Set.of("chapterId","title","type","isRequired","description","requirements",
            "estimatedMinutes","knowledgePointIds","dueAt","lateUntil","allowResubmit","maxAttempts","maxScore","rubric","initialFiles");
    private static final Set<String> CREATE_REQUIRED=Set.of("title","type","isRequired","description","requirements",
            "estimatedMinutes","knowledgePointIds","dueAt","allowResubmit","maxAttempts","maxScore","rubric","initialFiles");
    private static final Set<String> CRITERION_FIELDS=Set.of("criterionId","title","description","maxScore");
    private static final Set<String> TYPES=Set.of("web_lab","sql_text","text");
    private static final Pattern CRITERION_ID=Pattern.compile("^[a-zA-Z0-9_-]+$");
    private static final BigDecimal MAX_SCORE=new BigDecimal("9999.99");
    /** 通过完整校验的作业草稿内容（AssignmentWriteDTO 语义）。 */
    public record Draft(String chapterId,String title,String description,int estimatedMinutes,String type,boolean isRequired,
            Instant dueAt,Instant lateUntil,boolean allowResubmit,int maxAttempts,BigDecimal maxScore,
            List<String> requirements,List<RubricCriterion> rubric,List<FileDTO> initialFiles,List<String> knowledgePointIds) {}
    /** createAssignment 请求体：未知字段 400 INVALID_REQUEST；缺必填字段或 aiPolicyVersion 非 null 为 422。 */
    public static void checkCreateBody(Map<String,Object> body) {
        if(body==null) throw invalid();
        for(String key:body.keySet()) {
            if(!WRITE_FIELDS.contains(key)&&!"aiPolicyVersion".equals(key)) throw invalidRequest();
        }
        if(body.get("aiPolicyVersion")!=null) throw invalid();
        for(String key:CREATE_REQUIRED) {
            if(!body.containsKey(key)) throw invalid();
        }
    }
    /** patchAssignment 请求体：未知字段 400 INVALID_REQUEST；空对象 422（minProperties=1）。 */
    public static void checkPatchBody(Map<String,Object> body) {
        if(body==null) throw invalid();
        for(String key:body.keySet()) {
            if(!WRITE_FIELDS.contains(key)) throw invalidRequest();
        }
        if(body.isEmpty()) throw invalid();
    }
    public static Set<String> allowedPaths(String assignmentType) {
        return switch(assignmentType) {
            case "web_lab"->Set.of("index.html","style.css","script.js");
            case "sql_text"->Set.of("answer.sql");
            default->Set.of("answer.md");
        };
    }
    /** 解析并校验完整作业内容（不含需要查库的同班关联校验）；chapterId、lateUntil 缺省视为 null。 */
    public static Draft parseDraft(Map<String,Object> m) {
        String chapterId=optionalUuid(m,"chapterId");
        String title=text(m,"title",200);
        String description=textOrEmpty(m,"description",8000);
        int estimatedMinutes=integer(m,"estimatedMinutes");
        if(estimatedMinutes<1) throw invalid();
        String type=text(m,"type",16);
        if(!TYPES.contains(type)) throw invalid();
        boolean isRequired=bool(m,"isRequired");
        Instant dueAt=timestamp(m,"dueAt");
        Instant lateUntil=optionalTimestamp(m,"lateUntil");
        if(lateUntil!=null&&!lateUntil.isAfter(dueAt)) throw invalid();
        boolean allowResubmit=bool(m,"allowResubmit");
        int maxAttempts=integer(m,"maxAttempts");
        if(maxAttempts<1) throw invalid();
        BigDecimal maxScore=score(m.get("maxScore"));
        List<String> requirements=requirementList(m);
        List<RubricCriterion> rubric=rubricList(m,maxScore);
        List<FileDTO> initialFiles=initialFileList(m,type);
        List<String> knowledgePointIds=uuidList(m,"knowledgePointIds");
        return new Draft(chapterId,title,description,estimatedMinutes,type,isRequired,dueAt,lateUntil,allowResubmit,
                maxAttempts,maxScore,requirements,rubric,initialFiles,knowledgePointIds);
    }
    /** 允许空串的文本字段（契约仅限制 maxLength）。 */
    public static String textOrEmpty(Map<String,Object> body,String name,int max) {
        if(!(body.get(name) instanceof String text)||text.codePointCount(0,text.length())>max) throw invalid();
        return text;
    }
    /** 分值：正数、不超过 9999.99、最多两位小数；不做四舍五入。 */
    public static BigDecimal score(Object value) {
        if(!(value instanceof Number number)) throw invalid();
        BigDecimal bd;
        try { bd=new BigDecimal(number.toString()); } catch(NumberFormatException exception) { throw invalid(); }
        if(bd.compareTo(BigDecimal.ZERO)<=0||bd.compareTo(MAX_SCORE)>0||bd.stripTrailingZeros().scale()>2) throw invalid();
        return bd.setScale(2);
    }
    private static int cp(String text) { return text.codePointCount(0,text.length()); }
    private static List<String> requirementList(Map<String,Object> m) {
        if(!(m.get("requirements") instanceof List<?> list)||list.isEmpty()) throw invalid();
        List<String> result=new ArrayList<>();
        for(Object item:list) {
            if(!(item instanceof String text)||cp(text)>8000) throw invalid();
            result.add(text);
        }
        return result;
    }
    private static List<String> uuidList(Map<String,Object> m,String name) {
        if(!(m.get(name) instanceof List<?> list)) throw invalid();
        List<String> result=new ArrayList<>();
        Set<String> seen=new HashSet<>();
        for(Object item:list) {
            if(!(item instanceof String text)) throw invalid();
            uuid(text);
            if(!seen.add(text)) throw invalid();
            result.add(text);
        }
        return result;
    }
    /** 量规：至少一条；criterionId 唯一且符合模式；总分必须等于 maxScore。 */
    private static List<RubricCriterion> rubricList(Map<String,Object> m,BigDecimal maxScore) {
        if(!(m.get("rubric") instanceof List<?> list)||list.isEmpty()) throw invalid();
        List<RubricCriterion> result=new ArrayList<>();
        Set<String> ids=new HashSet<>();
        BigDecimal sum=BigDecimal.ZERO;
        for(Object item:list) {
            if(!(item instanceof Map<?,?> raw)) throw invalid();
            for(Object key:raw.keySet()) {
                if(!CRITERION_FIELDS.contains(key)) throw invalidRequest();
            }
            if(!(raw.get("criterionId") instanceof String id)||id.isEmpty()||id.length()>64
                    ||!CRITERION_ID.matcher(id).matches()) throw invalid();
            if(!(raw.get("title") instanceof String title)||cp(title)<1||cp(title)>200) throw invalid();
            if(!(raw.get("description") instanceof String description)||cp(description)>8000) throw invalid();
            BigDecimal criterionScore=score(raw.get("maxScore"));
            if(!ids.add(id)) throw invalid();
            sum=sum.add(criterionScore);
            result.add(new RubricCriterion(id,title,description,criterionScore));
        }
        if(sum.compareTo(maxScore)!=0) throw invalid();
        return result;
    }
    /** 初始文件：1~3 个；文件名必须属于作业类型允许集合（否则 400 INVALID_FILE_PATH）；单文件 100 KiB、总计 256 KiB。 */
    private static List<FileDTO> initialFileList(Map<String,Object> m,String type) {
        if(!(m.get("initialFiles") instanceof List<?> list)||list.isEmpty()||list.size()>3) throw invalid();
        Set<String> allowed=allowedPaths(type);
        Set<String> seen=new HashSet<>();
        List<FileDTO> result=new ArrayList<>();
        long total=0;
        for(Object item:list) {
            if(!(item instanceof Map<?,?> file)) throw invalid();
            for(Object key:file.keySet()) {
                if(!"path".equals(key)&&!"content".equals(key)) throw invalidRequest();
            }
            if(!(file.get("path") instanceof String path)||!(file.get("content") instanceof String content)) throw invalid();
            if(!allowed.contains(path)) throw invalidFilePath();
            if(!seen.add(path)) throw invalid();
            int bytes=content.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
            if(bytes>102400) throw invalid();
            total+=bytes;
            result.add(new FileDTO(path,content));
        }
        if(total>262144) throw invalid();
        return result;
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
