package com.learningplatform.modules.checks;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

@Repository
public class CheckStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public CheckStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    Policy policy(String assignmentId) {
        return jdbc.query("SELECT version, config FROM assignment_check_policies WHERE assignment_id=?",
                (r, n) -> new Policy(r.getInt("version"), readMap(r.getString("config"))), assignmentId)
                .stream().findFirst().orElse(new Policy(0, null));
    }

    void savePolicy(String assignmentId, int version, Map<?, ?> config) {
        String value = config == null ? null : json.writeValueAsString(config);
        jdbc.update("""
                INSERT INTO assignment_check_policies (assignment_id,version,config) VALUES (?,?,?) AS incoming
                ON DUPLICATE KEY UPDATE version=incoming.version,config=incoming.config
                """, assignmentId, version, value);
    }

    CheckView byRevision(String assignmentId, String studentId, int revision) {
        return jdbc.query("""
                SELECT * FROM assignment_checks WHERE assignment_id=? AND student_id=? AND workspace_revision=?
                """, (r, n) -> view(r), assignmentId, studentId, revision).stream().findFirst().orElse(null);
    }

    CheckView forStudent(String id, String studentId) {
        return jdbc.query("SELECT * FROM assignment_checks WHERE id=? AND student_id=?",
                (r, n) -> view(r), id, studentId).stream().findFirst().orElse(null);
    }

    void lockQueue() {
        jdbc.queryForObject("SELECT id FROM check_queue_guard WHERE id=1 FOR UPDATE", Integer.class);
    }

    int inFlight(String studentId) {
        String sql = "SELECT COUNT(*) FROM assignment_checks WHERE status IN ('queued','running')";
        return studentId == null ? jdbc.queryForObject(sql, Integer.class) :
                jdbc.queryForObject(sql + " AND student_id=?", Integer.class, studentId);
    }

    void enqueue(String id, String assignmentId, String studentId, int revision,
                 Map<String, Object> policy, Map<String, String> files, Instant now) {
        jdbc.update("""
                INSERT INTO assignment_checks
                    (id,assignment_id,student_id,workspace_revision,checker_version,status,
                     policy_snapshot,file_snapshot,created_at)
                VALUES (?,?,?,?,'course-check-v1','queued',?,?,?)
                """, id, assignmentId, studentId, revision,
                json.writeValueAsString(policy), json.writeValueAsString(files), sqlTime(now));
    }

    List<String> queued() {
        return jdbc.queryForList("""
                SELECT id FROM assignment_checks WHERE status='queued' ORDER BY created_at,id LIMIT 1
                """, String.class);
    }

    Job claim(String id, String token, Instant expiresAt) {
        if (jdbc.update("""
                UPDATE assignment_checks SET status='running',lease_token=?,lease_until=?
                WHERE id=? AND status='queued'
                """, token, sqlTime(expiresAt), id) != 1) return null;
        return jdbc.query("""
                SELECT policy_snapshot,file_snapshot FROM assignment_checks
                WHERE id=? AND status='running' AND lease_token=?
                """, (r, n) -> new Job(readMap(r.getString(1)), readFiles(r.getString(2))), id, token)
                .stream().findFirst().orElse(null);
    }

    void complete(String id, String token, Instant now, Map<String, Object> result, Map<String, Object> error) {
        jdbc.update("""
                UPDATE assignment_checks SET status=?,result=?,error=?,completed_at=?,policy_snapshot=NULL,
                    file_snapshot=NULL,lease_token=NULL,lease_until=NULL
                WHERE id=? AND status='running' AND lease_token=?
                """, error == null ? "completed" : "error",
                result == null ? null : json.writeValueAsString(result),
                error == null ? null : json.writeValueAsString(error), sqlTime(now), id, token);
    }

    void expire(Instant now) {
        jdbc.update("""
                UPDATE assignment_checks
                SET status='error',error=?,completed_at=?,policy_snapshot=NULL,
                    file_snapshot=NULL,lease_token=NULL,lease_until=NULL
                WHERE (status='running' AND lease_until <= ?) OR (status='queued' AND created_at <= ?)
                """, json.writeValueAsString(Map.of("code", "RUNNER_UNAVAILABLE", "message", "检查未能在规定时间内完成。")),
                sqlTime(now), sqlTime(now), sqlTime(now.minusSeconds(600)));
    }

    private CheckView view(ResultSet row) throws SQLException {
        return new CheckView(row.getString("id"), row.getString("assignment_id"),
                row.getInt("workspace_revision"), row.getString("checker_version"), row.getString("status"),
                readMap(row.getString("result")), readMap(row.getString("error")),
                instant(row, "created_at"), instant(row, "completed_at"));
    }

    private static Instant instant(ResultSet row, String column) throws SQLException {
        LocalDateTime value = row.getObject(column, LocalDateTime.class);
        return value == null ? null : value.toInstant(ZoneOffset.UTC);
    }

    private static LocalDateTime sqlTime(Instant value) {
        return LocalDateTime.ofInstant(value, ZoneOffset.UTC);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readMap(String value) {
        return value == null ? null : json.readValue(value, Map.class);
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> readFiles(String value) {
        return json.readValue(value, Map.class);
    }

    public record Policy(int version, Map<String, Object> config) {}
    public record CheckView(String id, String assignmentId, int workspaceRevision, String checkerVersion,
                            String status, Map<String, Object> result, Map<String, Object> error,
                            Instant createdAt, Instant completedAt) {}
    record Job(Map<String, Object> policy, Map<String, String> files) {}
}
