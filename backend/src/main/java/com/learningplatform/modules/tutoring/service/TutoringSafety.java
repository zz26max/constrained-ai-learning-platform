package com.learningplatform.modules.tutoring.service;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;
import com.learningplatform.modules.tutoring.provider.TutoringProvider;
/** Conservative rule gate supplements the provider; rejected material receives a fixed template. */
public final class TutoringSafety {
 private TutoringSafety(){}
 public static final String TEMPLATE="请先说明你观察到的现象和已经尝试的步骤，再围绕一个概念验证思路。如仍有困难，请向教师求助。";
 private static final Pattern INTENT=Pattern.compile("(?is)(完整.{0,8}(代码|答案|实现)|直接.{0,8}(答案|代码)|忽略.{0,12}(规则|指令)|扮演.{0,8}(教师|老师|系统)|ignore.{0,25}(instruction|rule)|complete.{0,15}(solution|code)|system\\s*prompt)");
 private static final Pattern SECRET=Pattern.compile("(?is)([A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}|(?:1[3-9]\\d{9})|(?:sk-[a-z0-9]{12,})|(?:password|api[_-]?key|authorization|lp_session|secret)\\s*[:=]|姓名\\s*[:：]|学号\\s*[:：])");
 public static boolean prohibited(String text){return text!=null&&INTENT.matcher(text).find();}
 public static boolean sensitive(String text){return text!=null&&SECRET.matcher(text).find();}
 public static boolean acceptable(TutoringProvider.Output output,int level,List<String> modes,int maxTokens,List<String> history){
  if(output==null||output.mode()==null||output.nextAction()==null||output.hintLevel()!=level||!modes.contains(output.mode())||!List.of("try_and_report","review_concept","request_teacher_help","none").contains(output.nextAction()))return false;
  String c=output.content();if(c==null||c.isBlank()||c.codePointCount(0,c.length())>maxTokens||c.contains("```")||c.contains("~~~")||prohibited(c)||sensitive(c))return false;
  // Code and implementation fragments remain disallowed even when the model omits fences.
  if(Pattern.compile("(?is)(<script|<!doctype|function\\s*\\(|function\\s+\\w+|(?:SELECT|INSERT INTO|CREATE TABLE)\\s|(?:const|let|var)\\s+\\w+\\s*=|=>|document\\.|def\\s+\\w+\\(|public\\s+class|完整实现)").matcher(c).find())return false;
  // Limit cumulative disclosure across all sessions: large cumulative explanation requests fall back.
  return history.stream().mapToInt(String::length).sum()+c.length()<=12000;
 }
}
