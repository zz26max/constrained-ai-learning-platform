package com.learningplatform.common.database;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Upgrades a real populated V13 schema, including ambiguous and malformed legacy audits. */
@Testcontainers
class NoticeRecipientMigrationIT {
    @Container static final MySQLContainer mysql=new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("notice_migration_test").withUsername("notice_test").withPassword(UUID.randomUUID().toString())
            .withCommand("--character-set-server=utf8mb4","--default-time-zone=+00:00","--transaction-isolation=READ-COMMITTED");

    @Test void upgradeBackfillsOnlyUniqueValidCreationAuditsAndPreservesUnknowns() {
        var dataSource=new DriverManagerDataSource(mysql.getJdbcUrl(),mysql.getUsername(),mysql.getPassword());
        var before=Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").target("13").load();
        assertThat(before.migrate().migrationsExecuted).isEqualTo(13);
        Integer originalChecksum=before.info().applied()[0].getChecksum();
        var jdbc=new JdbcTemplate(dataSource);
        Timestamp now=Timestamp.from(Instant.parse("2026-10-26T00:00:00Z"));
        String teacher=id(),term=id(),course=id(),offering=id();
        jdbc.update("INSERT INTO users(id,username,display_name,password_hash,roles,status,created_at,updated_at) VALUES(?, 'notice.teacher','Teacher','TEST_ONLY',JSON_ARRAY('teacher'),'active',?,?)",teacher,now,now);
        jdbc.update("INSERT INTO terms(id,label,starts_at,ends_at,is_current,created_at,updated_at) VALUES(?,'Term',?,DATE_ADD(?,INTERVAL 1 DAY),1,?,?)",term,now,now,now,now);
        jdbc.update("INSERT INTO courses(id,code,mark,title,description,status,created_by,created_at,updated_at) VALUES(?,'notice-course','N','Course','','active',?,?,?)",course,teacher,now,now);
        jdbc.update("INSERT INTO course_offerings(id,course_id,term_id,title,group_name,progress_unit,status,created_by,created_at,updated_at) VALUES(?,?,?,'Offering','Group','chapter','active',?,?,?)",offering,course,term,teacher,now,now);
        jdbc.update("INSERT INTO offering_members(id,offering_id,user_id,role,status,joined_at,created_at,updated_at) VALUES(?,?,?,'teacher','active',?,?,?)",id(),offering,teacher,now,now,now);
        Map<String,Integer> expected=new LinkedHashMap<>();
        for(String metadata:new String[]{"{\"notified\":0}","{\"notified\":7}","{\"notified\":2147483647}",
                "{}","{\"notified\":\"9\"}","{\"notified\":-1}","{\"notified\":1.5}","{\"notified\":2147483648}",
                "{\"notified\":18446744073709551615}","{\"notified\":true}","{\"notified\":null}"}) {
            String notice=notice(jdbc,offering,teacher,now);
            audit(jdbc,notice,metadata,"NOTICE_CREATED","notice",now);
            Integer count=switch(metadata) {
                case "{\"notified\":0}" -> 0;
                case "{\"notified\":7}" -> 7;
                case "{\"notified\":2147483647}" -> Integer.MAX_VALUE;
                default -> null;
            };
            expected.put(notice,count);
        }
        String duplicate=notice(jdbc,offering,teacher,now);
        audit(jdbc,duplicate,"{\"notified\":4}","NOTICE_CREATED","notice",now);
        audit(jdbc,duplicate,"{\"notified\":4}","NOTICE_CREATED","notice",now);
        expected.put(duplicate,null);
        String missing=notice(jdbc,offering,teacher,now);
        expected.put(missing,null);
        String wrongType=notice(jdbc,offering,teacher,now);
        audit(jdbc,wrongType,"{\"notified\":4}","NOTICE_CREATED","assignment",now);
        expected.put(wrongType,null);
        String wrongAction=notice(jdbc,offering,teacher,now);
        audit(jdbc,wrongAction,"{\"notified\":4}","NOTICE_OTHER","notice",now);
        expected.put(wrongAction,null);

        var after=Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load();
        assertThat(after.migrate().migrationsExecuted).isEqualTo(3);
        expected.forEach((notice,count) -> assertThat(jdbc.queryForObject("SELECT recipient_count FROM notices WHERE id=?",Integer.class,notice)).isEqualTo(count));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notices",Integer.class)).isEqualTo(expected.size());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notifications",Integer.class)).isZero();
        assertThat(after.migrate().migrationsExecuted).isZero();
        assertThat(after.info().applied()[0].getChecksum()).isEqualTo(originalChecksum);
        assertThatThrownBy(() -> jdbc.update("UPDATE notices SET recipient_count=-1 WHERE id=?",missing))
                .isInstanceOf(org.springframework.dao.DataAccessException.class)
                .hasRootCauseInstanceOf(java.sql.SQLException.class)
                .satisfies(error -> {
                    Throwable cause = error;
                    while (cause.getCause() != null) cause = cause.getCause();
                    assertThat(((java.sql.SQLException) cause).getErrorCode()).isEqualTo(3819);
                    assertThat(cause.getMessage()).contains("ck_notices_recipient_count");
                });
    }

    private static String notice(JdbcTemplate jdbc,String offering,String teacher,Timestamp now) {
        String id=id();
        jdbc.update("INSERT INTO notices(id,offering_id,author_id,title,content,created_at) VALUES(?,?,?,'Same title','Content',?)",id,offering,teacher,now);
        return id;
    }
    private static void audit(JdbcTemplate jdbc,String notice,String metadata,String action,String type,Timestamp now) {
        jdbc.update("INSERT INTO audit_logs(id,action,target_type,target_id,metadata,request_id,created_at) VALUES(?,?,?,?,CAST(? AS JSON),'migration-test',?)",id(),action,type,notice,metadata,now);
    }
    private static String id(){return UUID.randomUUID().toString();}
}
