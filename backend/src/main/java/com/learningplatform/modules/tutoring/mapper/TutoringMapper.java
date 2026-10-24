package com.learningplatform.modules.tutoring.mapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
/** SQL boundary. All inputs are bound; the callers own short transactions. */
@Repository
public class TutoringMapper {
 private final JdbcTemplate jdbc;
 public TutoringMapper(JdbcTemplate jdbc){this.jdbc=jdbc;}
 public Map<String,Object> one(TutoringSql sql,Object... args){var rows=jdbc.queryForList(sql.text,values(args));return rows.isEmpty()?null:rows.getFirst();}
 public List<Map<String,Object>> list(TutoringSql sql,Object... args){return jdbc.queryForList(sql.text,values(args));}
 public int update(TutoringSql sql,Object... args){return jdbc.update(sql.text,values(args));}
 public int count(TutoringSql sql,Object... args){return jdbc.queryForObject(sql.text,Integer.class,values(args));}
 private Object[] values(Object[] args){return Arrays.stream(args).map(v->v instanceof Instant i?Timestamp.from(i):v).toArray();}
 public static Instant instant(Object v){if(v instanceof Timestamp t)return t.toInstant();if(v instanceof java.time.LocalDateTime t)return t.toInstant(java.time.ZoneOffset.UTC);return (Instant)v;}
}
