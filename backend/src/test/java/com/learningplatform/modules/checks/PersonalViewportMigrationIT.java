package com.learningplatform.modules.checks;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mysql.MySQLContainer;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class PersonalViewportMigrationIT {
    private static final String ASSIGNMENT = "00000000-0000-4000-8000-000000000610";
    private static final String OFFERING = "00000000-0000-4000-8000-000000000210";
    private static final String STUDENT = UUID.randomUUID().toString();
    private static final String CHECK = UUID.randomUUID().toString();
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static JdbcTemplate jdbc;

    @Container
    private static final MySQLContainer MYSQL = new MySQLContainer("mysql:8.4.11")
            .withDatabaseName("viewport_migration_test")
            .withUsername("viewport_test").withPassword(UUID.randomUUID().toString());

    @BeforeAll
    static void upgradeExistingCheck() {
        var dataSource = new DriverManagerDataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
        Flyway.configure().dataSource(dataSource).target("19").load().migrate();
        jdbc = new JdbcTemplate(dataSource);
        jdbc.update("""
                INSERT INTO users(id,username,display_name,password_hash,roles,status,created_at,updated_at)
                VALUES(?,'viewport.test','自测学生','TEST_ONLY',JSON_ARRAY('student'),'active',UTC_TIMESTAMP(),UTC_TIMESTAMP())
                """, STUDENT);
        jdbc.update("""
                INSERT INTO offering_members(id,offering_id,user_id,role,status,joined_at,created_at,updated_at)
                VALUES(?,?,?,'student','active',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())
                """, UUID.randomUUID().toString(), OFFERING, STUDENT);
        jdbc.update("""
                INSERT INTO workspaces(id,offering_id,assignment_id,student_id,revision,active_file,created_at,updated_at)
                VALUES(?,?,?,?,1,'index.html',UTC_TIMESTAMP(),UTC_TIMESTAMP())
                """, UUID.randomUUID().toString(), OFFERING, ASSIGNMENT, STUDENT);
        jdbc.update("""
                INSERT INTO assignment_checks(id,assignment_id,student_id,workspace_revision,checker_version,
                    status,result,created_at,completed_at)
                VALUES(?,?,?,1,'course-check-v1','completed',JSON_OBJECT('passed',3,'total',3),
                    UTC_TIMESTAMP(),UTC_TIMESTAMP())
                """, CHECK, ASSIGNMENT, STUDENT);
        assertThat(Flyway.configure().dataSource(dataSource).load().migrate().migrationsExecuted).isEqualTo(1);
    }

    @Test
    void upgradePreservesHistoricReportAndIgnoresItInCurrentLookup() {
        var checks = new CheckStore(jdbc, JSON);
        var policy = checks.policy(ASSIGNMENT);
        assertThat(policy.version()).isEqualTo(2);
        assertThat(checks.byRevision(ASSIGNMENT, STUDENT, 1, policy.version())).isNull();
        var historic = checks.forStudent(CHECK, STUDENT);
        assertThat(historic.view().result()).containsEntry("passed", 3);
        assertThat(historic.currentConfig()).isNull();
        assertThat(checks.byRevision(ASSIGNMENT, STUDENT, 1, 1).id()).isEqualTo(CHECK);
    }

    @ParameterizedTest
    @CsvSource({
        "'width=1280', 2",
        "'initial-scale=1', 2",
        "'width=device-width, width=1280', 2",
        "'width=device-width', 3",
        "'width=device-width, initial-scale=1.0', 3"
    })
    @EnabledIfSystemProperty(named = "checks.it.runners", matches = "true")
    void correctedExerciseChecksDeviceWidthInTheRealRunner(String content, int passed) {
        var files = new HashMap<String, String>();
        jdbc.query("""
                SELECT file_path,content FROM assignment_initial_files WHERE assignment_id=?
                """, r -> { files.put(r.getString(1), r.getString(2)); }, ASSIGNMENT);
        files.compute("index.html", (path, html) -> html.replace("<head>",
                "<head><meta name=\"viewport\" content=\"" + content + "\">"));
        var runner = new CheckRunner(JSON, "lms-web-check:1", "lms-sql-check:1");
        assertThat(runner.run(UUID.randomUUID().toString(), new CheckStore(jdbc, JSON).policy(ASSIGNMENT).config(), files))
                .containsEntry("passed", passed).containsEntry("total", 3);
    }
}
