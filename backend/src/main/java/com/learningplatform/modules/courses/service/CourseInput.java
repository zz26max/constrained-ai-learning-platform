package com.learningplatform.modules.courses.service;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import com.learningplatform.common.exception.BusinessException;
import org.springframework.http.HttpStatus;
/** 已解析 JSON 的结构/语义校验，PATCH 的省略与 null 保持分开。 */
public final class CourseInput {
    private CourseInput() {}
    public static final String UUID_REGEX="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    public static void fields(Map<String,Object> body,String... allowed) {
        if(body==null) throw invalid();
        Set<String> keys=Set.of(allowed);
        if(!keys.containsAll(body.keySet())) throw new BusinessException(HttpStatus.BAD_REQUEST,"INVALID_REQUEST","请求字段不符合要求。");
    }
    public static void empty(Map<String,Object> body) { fields(body); }
    public static String text(Map<String,Object> body,String name,int max) {
        Object value=body.get(name);
        if(!(value instanceof String text)||text.codePointCount(0,text.length())<1||text.codePointCount(0,text.length())>max) throw invalid();
        return text;
    }
    public static String textAllowEmpty(Map<String,Object> body,String name,int max) {
        Object value=body.get(name);
        if(!(value instanceof String text)||text.codePointCount(0,text.length())>max) throw invalid();
        return text;
    }
    public static String uuid(String value) { if(value==null||!value.matches(UUID_REGEX)) throw invalid(); return value; }
    public static String uuid(Map<String,Object> body,String name) { return uuid(text(body,name,36)); }
    public static Instant timestamp(Map<String,Object> body,String name) {
        String text=text(body,name,40);
        if(!Pattern.matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?Z",text)) throw invalid();
        try { return Instant.parse(text); } catch(RuntimeException exception) { throw invalid(); }
    }
    public static Integer optionalPositive(Map<String,Object> body,String name) {
        Object value=body.get(name);
        if(value==null) return null;
        if(!(value instanceof Number number)||number.longValue()<1||number.longValue()>Integer.MAX_VALUE
                ||number.doubleValue()!=number.longValue()) throw invalid();
        return number.intValue();
    }
    public static void page(int page,int size) { if(page<1||size<1||size>100) throw invalid(); }
    public static BusinessException invalid() { return new BusinessException(HttpStatus.UNPROCESSABLE_CONTENT,"VALIDATION_ERROR","请求参数不符合要求。"); }
}

