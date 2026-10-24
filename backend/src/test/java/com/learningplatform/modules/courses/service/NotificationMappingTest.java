package com.learningplatform.modules.courses.service;

import java.time.Instant;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.NotificationDTO;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.TargetDTO;
import com.learningplatform.modules.courses.model.AssignmentRows.MessageRow;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 消息行 → NotificationDTO 组装规则：course_notice 继承公告跳转目标（V10 列），其余类型沿用既有关联列。 */
class NotificationMappingTest {
    private static final String OFFERING="00000000-0000-4000-8000-0000000000b1";
    private static final String TARGET="00000000-0000-4000-8000-0000000000b2";
    private static final String ID="00000000-0000-4000-8000-0000000000b3";

    private static MessageRow row(String type,String assignmentId,String feedbackId,String targetType,String targetId) {
        return new MessageRow(ID,type,"标题","内容",OFFERING,assignmentId,feedbackId,targetType,targetId,
                null,null,Instant.parse("2026-10-24T00:00:00Z"),null);
    }

    @Test
    void courseNoticeInheritsNoticeTargetWhenPresent() {
        NotificationDTO dto=AssignmentService.notification(row("notice_published",null,null,"chapter",TARGET));
        assertThat(dto.type()).isEqualTo("course_notice");
        assertThat(dto.target()).isEqualTo(new TargetDTO("chapter",TARGET,OFFERING));
    }

    @Test
    void courseNoticeWithoutTargetStaysNull() {
        NotificationDTO dto=AssignmentService.notification(row("notice_published",null,null,null,null));
        assertThat(dto.type()).isEqualTo("course_notice");
        assertThat(dto.target()).isNull();
    }

    @Test
    void legacyColumnsStillDriveOtherTypes() {
        assertThat(AssignmentService.notification(row("assignment_published",TARGET,null,null,null)).target())
                .isEqualTo(new TargetDTO("assignment",TARGET,OFFERING));
        assertThat(AssignmentService.notification(row("feedback_published",null,TARGET,null,null)).target())
                .isEqualTo(new TargetDTO("feedback",TARGET,OFFERING));
        assertThat(AssignmentService.notification(row("notice_published",TARGET,TARGET,"assignment",TARGET)).target())
                .isEqualTo(new TargetDTO("assignment",TARGET,OFFERING));
    }
}
