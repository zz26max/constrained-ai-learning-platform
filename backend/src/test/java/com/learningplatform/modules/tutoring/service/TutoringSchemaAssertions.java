package com.learningplatform.modules.tutoring.service;
import java.util.*;
import java.nio.file.*;
import org.yaml.snakeyaml.Yaml;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.*;
/** Interprets the JSON Schema keywords used by tutoring's OpenAPI responses, including conditional tombstones. */
final class TutoringSchemaAssertions {
 private static final Map<String,Object> ROOT=load();
 @SuppressWarnings("unchecked") static Map<String,Object> load(){try{Path p=Path.of("../docs/openapi.yaml");if(!Files.exists(p))p=Path.of("docs/openapi.yaml");return new Yaml().load(Files.readString(p));}catch(Exception e){throw new IllegalStateException(e);}}
 static void response(String schema,String body){Object value=JsonMapper.builder().findAndAddModules().build().readValue(body,Object.class);check(Map.of("$ref","#/components/schemas/"+schema),value,"$");}
 @SuppressWarnings("unchecked") private static Map<String,Object> object(Object o){return (Map<String,Object>)o;}
 static boolean matches(Map<String,Object>s,Object value){try{check(s,value,"$");return true;}catch(AssertionError e){return false;}}
 @SuppressWarnings("unchecked") static void check(Map<String,Object>s,Object value,String path){
  if(s.containsKey("$ref")){Object ref=ROOT;for(String key:((String)s.get("$ref")).substring(2).split("/"))ref=object(ref).get(key);check(object(ref),value,path);return;}
  if(s.containsKey("type")){String t=(String)s.get("type");boolean valid=switch(t){case "object"->value instanceof Map;case "array"->value instanceof List;case "string"->value instanceof String;case "integer"->value instanceof Number n&&n.doubleValue()==n.longValue();case "number"->value instanceof Number;case "boolean"->value instanceof Boolean;case "null"->value==null;default->throw new IllegalStateException("Unsupported type "+t);};assertThat(valid).as(path+" type "+t).isTrue();}
  if(s.containsKey("const"))assertThat(value).as(path+" const").isEqualTo(s.get("const"));
  if(s.containsKey("enum"))assertThat((List<Object>)s.get("enum")).as(path+" enum").contains(value);
  if(s.containsKey("anyOf"))assertThat(((List<Map<String,Object>>)s.get("anyOf")).stream().anyMatch(branch->matches(branch,value))).as(path+" anyOf").isTrue();
  if(s.containsKey("allOf"))for(var branch:(List<Map<String,Object>>)s.get("allOf"))check(branch,value,path);
  if(s.containsKey("if")){boolean yes=matches(object(s.get("if")),value);String branch=yes?"then":"else";if(s.containsKey(branch))check(object(s.get(branch)),value,path);}
  if(value instanceof Map<?,?>v){var properties=s.containsKey("properties")?object(s.get("properties")):Map.<String,Object>of();if(s.containsKey("required"))for(var key:(List<String>)s.get("required"))assertThat(v.containsKey(key)).as(path+" required "+key).isTrue();
   if(Boolean.FALSE.equals(s.get("additionalProperties")))assertThat(properties.keySet()).as(path+" declared properties").containsAll((Collection<String>)v.keySet());for(var entry:properties.entrySet())if(v.containsKey(entry.getKey()))check(object(entry.getValue()),v.get(entry.getKey()),path+"."+entry.getKey());}
  if(value instanceof List<?>v){if(s.containsKey("minItems"))assertThat(v.size()).as(path).isGreaterThanOrEqualTo(((Number)s.get("minItems")).intValue());if(s.containsKey("maxItems"))assertThat(v.size()).as(path).isLessThanOrEqualTo(((Number)s.get("maxItems")).intValue());if(Boolean.TRUE.equals(s.get("uniqueItems")))assertThat(new HashSet<>(v).size()).isEqualTo(v.size());if(s.containsKey("items"))for(Object item:v)check(object(s.get("items")),item,path+"[]");}
  if(value instanceof String v){int length=v.codePointCount(0,v.length());if(s.containsKey("minLength"))assertThat(length).as(path).isGreaterThanOrEqualTo(((Number)s.get("minLength")).intValue());if(s.containsKey("maxLength"))assertThat(length).as(path).isLessThanOrEqualTo(((Number)s.get("maxLength")).intValue());if(s.containsKey("pattern"))assertThat(java.util.regex.Pattern.compile((String)s.get("pattern")).matcher(v).find()).as(path+" pattern").isTrue();if("date-time".equals(s.get("format")))assertThatCode(()->java.time.Instant.parse(v)).doesNotThrowAnyException();}
  if(value instanceof Number n){if(s.containsKey("minimum"))assertThat(n.doubleValue()).as(path).isGreaterThanOrEqualTo(((Number)s.get("minimum")).doubleValue());if(s.containsKey("maximum"))assertThat(n.doubleValue()).as(path).isLessThanOrEqualTo(((Number)s.get("maximum")).doubleValue());}
 }
}
