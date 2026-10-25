package com.learningplatform.modules.tutoring.service;
import java.util.*;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
@Component
public class TutoringJson {
 private final ObjectMapper json;
 public TutoringJson(ObjectMapper json){this.json=json;}
 public String write(Object value){return json.writeValueAsString(value);}
 @SuppressWarnings("unchecked") public Map<String,Object> read(Object value){return value==null?null:json.readValue(value.toString(),Map.class);}
 public static Map<String,Object> map(Object... pairs){var result=new LinkedHashMap<String,Object>();for(int i=0;i<pairs.length;i+=2)result.put((String)pairs[i],pairs[i+1]);return result;}
}
