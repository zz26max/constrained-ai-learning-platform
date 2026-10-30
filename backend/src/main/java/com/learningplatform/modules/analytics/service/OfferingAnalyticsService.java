package com.learningplatform.modules.analytics.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;
import com.learningplatform.modules.analytics.dto.OfferingAnalyticsDTOs.*;
import com.learningplatform.modules.analytics.mapper.KnowledgeMapper;
import com.learningplatform.modules.analytics.mapper.OfferingAnalyticsMapper;
import com.learningplatform.modules.analytics.mapper.OfferingAnalyticsMapper.*;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.mapper.CourseMapper;
import com.learningplatform.modules.courses.model.CourseRows.KnowledgePoint;
import com.learningplatform.modules.courses.service.CourseAccess;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 阶段二教师分析：只汇总已有事件与 knowledge-v2 证据，不产生成绩或能力结论。 */
@Service
public class OfferingAnalyticsService {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final int WINDOW_DAYS = 14;
    private final OfferingAnalyticsMapper mapper;
    private final CourseMapper courses;
    private final CourseAccess access;
    private final Clock clock;

    public OfferingAnalyticsService(OfferingAnalyticsMapper mapper, CourseMapper courses, CourseAccess access,
            Clock clock) {
        this.mapper = mapper;
        this.courses = courses;
        this.access = access;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public OfferingActivityDTO activity(String offeringId, UserDTO user) {
        access.requireTeacher(user, offeringId, false);
        LocalDate to = LocalDate.ofInstant(clock.instant(), ZONE);
        LocalDate from = to.minusDays(WINDOW_DAYS - 1);
        Instant start = from.atStartOfDay(ZONE).toInstant();
        Instant end = to.plusDays(1).atStartOfDay(ZONE).toInstant();
        Map<LocalDate, Day> days = new LinkedHashMap<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) days.put(date, new Day(date));
        Set<String> activeInWindow = new HashSet<>();
        for (ActivityEvent event : mapper.activityEvents(offeringId, start, end)) {
            Day day = days.get(LocalDate.ofInstant(event.receivedAt(), ZONE));
            if (day == null) continue;
            day.count(event.type());
            day.active.add(event.userId());
            activeInWindow.add(event.userId());
        }
        List<ActivityDayDTO> result = days.values().stream().map(Day::dto).toList();
        int chapter = 0, resource = 0, editor = 0, preview = 0, saved = 0, submitted = 0, help = 0, tutoring = 0;
        for (Day day : days.values()) {
            chapter += day.chapter; resource += day.resource; editor += day.editor; preview += day.preview;
            saved += day.saved; submitted += day.submitted; help += day.help; tutoring += day.tutoring;
        }
        return new OfferingActivityDTO(offeringId, from.toString(), to.toString(), result,
                new ActivityTotalsDTO(activeInWindow.size(), chapter, resource, editor, preview, saved, submitted,
                        help, tutoring));
    }

    @Transactional(readOnly = true)
    public OfferingKnowledgeMasteryDTO mastery(String offeringId, UserDTO user) {
        access.requireTeacher(user, offeringId, false);
        Map<String, Boolean> chapterVisibility = new HashMap<>();
        List<KnowledgePoint> points = courses.knowledgePoints(offeringId, null).stream()
                .filter(point -> visible(point, chapterVisibility)).toList();
        List<String> students = mapper.activeStudentIds(offeringId);
        Map<String, List<MasteryEvidence>> evidence = new HashMap<>();
        for (MasteryEvidence item : mapper.currentEvidence(offeringId)) {
            evidence.computeIfAbsent(key(item.knowledgePointId(), item.studentId()), ignored -> new ArrayList<>())
                    .add(item);
        }
        Set<String> inProgress = new HashSet<>();
        for (InProgressRow row : mapper.inProgress(offeringId)) inProgress.add(key(row.knowledgePointId(), row.studentId()));
        Set<String> assessedStudents = new HashSet<>();
        int[] total = new int[4];
        List<KnowledgeMasteryItemDTO> items = new ArrayList<>();
        for (KnowledgePoint point : points) {
            int[] distribution = new int[4];
            int assessed = 0;
            for (String student : students) {
                List<KnowledgeMapper.Evidence> recent = recent(evidence.get(key(point.id(), student)));
                String state = KnowledgeService.state(recent, inProgress.contains(key(point.id(), student)));
                distribution[index(state)]++;
                total[index(state)]++;
                if (!recent.isEmpty()) {
                    assessed++;
                    assessedStudents.add(student);
                }
            }
            items.add(new KnowledgeMasteryItemDTO(point.id(), point.title(), point.chapterId(), students.size(), assessed,
                    distribution(distribution), rate(distribution[0], students.size())));
        }
        int assessmentCount = students.size() * points.size();
        KnowledgeMasterySummaryDTO summary = new KnowledgeMasterySummaryDTO(assessmentCount, distribution(total),
                rate(total[0], assessmentCount));
        return new OfferingKnowledgeMasteryDTO(offeringId, "knowledge-v2",
                clock.instant().truncatedTo(ChronoUnit.MICROS), students.size(), assessedStudents.size(),
                points.size(), summary, items);
    }

    private boolean visible(KnowledgePoint point, Map<String, Boolean> cache) {
        if (point.chapterId() == null) return true;
        Boolean visible = cache.get(point.chapterId());
        if (visible == null) {
            var chapter = courses.chapter(point.chapterId());
            visible = chapter != null && "published".equals(chapter.status());
            cache.put(point.chapterId(), visible);
        }
        return visible;
    }

    private static List<KnowledgeMapper.Evidence> recent(List<MasteryEvidence> rows) {
        if (rows == null || rows.isEmpty()) return List.of();
        List<KnowledgeMapper.Evidence> result = new ArrayList<>(3);
        Set<String> assignments = new HashSet<>();
        for (MasteryEvidence row : rows) {
            if (!assignments.add(row.assignmentId())) continue;
            result.add(new KnowledgeMapper.Evidence(row.id(), null, null, row.assignmentId(), null, row.result(), null,
                    row.occurredAt()));
            if (result.size() == 3) break;
        }
        return result;
    }

    private static String key(String knowledgePointId, String studentId) {
        return knowledgePointId + "|" + studentId;
    }

    private static int index(String state) {
        return switch (state) {
            case "basically_mastered" -> 0;
            case "needs_practice" -> 1;
            case "learning" -> 2;
            default -> 3;
        };
    }

    private static KnowledgeStateDistributionDTO distribution(int[] counts) {
        return new KnowledgeStateDistributionDTO(counts[0], counts[1], counts[2], counts[3]);
    }

    private static BigDecimal rate(int part, int total) {
        if (total == 0) return null;
        return BigDecimal.valueOf(part).divide(BigDecimal.valueOf(total), 4, RoundingMode.HALF_UP).stripTrailingZeros();
    }

    private static final class Day {
        private final LocalDate date;
        private final Set<String> active = new HashSet<>();
        private int chapter, resource, editor, preview, saved, submitted, help, tutoring;

        private Day(LocalDate date) { this.date = date; }

        private void count(String type) {
            switch (type) {
                case "chapter_opened" -> chapter++;
                case "resource_opened" -> resource++;
                case "editor_opened" -> editor++;
                case "preview_opened" -> preview++;
                case "workspace_saved" -> saved++;
                case "assignment_submitted" -> submitted++;
                case "help_request_created" -> help++;
                case "tutoring_completed" -> tutoring++;
                default -> { }
            }
        }

        private ActivityDayDTO dto() {
            return new ActivityDayDTO(date.toString(), active.size(), chapter, resource, editor, preview, saved,
                    submitted, help, tutoring);
        }
    }
}
