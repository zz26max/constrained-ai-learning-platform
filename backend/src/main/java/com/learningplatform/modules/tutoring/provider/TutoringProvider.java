package com.learningplatform.modules.tutoring.provider;
import java.util.*;
/** Only server-approved, minimized context crosses this boundary. */
public interface TutoringProvider {
 record Context(String action,int hintLevel,int maxOutputTokens,List<String> allowedModes,String boundary,String question,String attempt,String workspace,List<String> publicMaterials,List<String> history) {}
 record Output(String mode,int hintLevel,String content,String nextAction,Integer inputTokens,Integer outputTokens) {}
 Output generate(Context context) throws Exception;
 boolean available();
}
