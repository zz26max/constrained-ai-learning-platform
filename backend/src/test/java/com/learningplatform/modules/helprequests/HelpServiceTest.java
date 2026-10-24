package com.learningplatform.modules.helprequests;
import java.time.*;
import java.util.*;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import com.learningplatform.modules.courses.service.CourseAccess;
import com.learningplatform.modules.tutoring.service.TutoringQueryService;
import com.learningplatform.modules.analytics.service.LearningEventService;
import com.learningplatform.modules.analytics.service.IssueTagService;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class HelpServiceTest {
 private final HelpMapper mapper=mock(HelpMapper.class);private final CourseAccess access=mock(CourseAccess.class);private final TutoringQueryService tutoring=mock(TutoringQueryService.class);
 private final HelpService service=new HelpService(mapper,mock(AssignmentMapper.class),access,tutoring,mock(LearningEventService.class),Clock.fixed(Instant.parse("2026-10-24T00:00:00Z"),ZoneOffset.UTC),mock(IssueTagService.class));
 private static final String ID="00000000-0000-4000-8000-000000000001";
 private static final UserDTO STUDENT=new UserDTO(ID,"student.test","学生",List.of("student"));
 @Test void teacherCannotUseStudentList(){assertThatThrownBy(()->service.list(new UserDTO(ID,"teacher.test","老师",List.of("teacher")),null,null,1,20,false)).hasMessageContaining("权限");verifyNoInteractions(mapper);}
 @Test void foreignRequestIsInvisibleBeforeAnySharedRead(){when(mapper.find(ID)).thenReturn(row("00000000-0000-4000-8000-000000000002",null,null));assertThatThrownBy(()->service.detail(STUDENT,ID,false)).hasMessageContaining("不存在");verifyNoInteractions(tutoring);}
 @Test void expiredSnapshotIsHiddenEvenBeforeCleanup(){when(mapper.find(ID)).thenReturn(row(ID,1,Instant.parse("2026-10-24T00:00:00Z")));when(mapper.replies(ID)).thenReturn(List.of());when(tutoring.sharedRequests(ID,ID,List.of(),false)).thenReturn(List.of());var result=service.detail(STUDENT,ID,false);var snapshot=(Map<?,?>)result.get("sharedSnapshot");assertThat(snapshot.get("files")).isNull();assertThat(snapshot.get("contentUnavailableReason")).isEqualTo("retention_expired");}
 @Test void unknownKeysRejected(){assertThatThrownBy(()->service.create(STUDENT,Map.of("unexpected",true))).hasMessageContaining("未知字段");verifyNoInteractions(mapper);}
 private static HelpRows.Request row(String student,Integer revision,Instant expires){Instant time=Instant.parse("2026-10-01T00:00:00Z");return new HelpRows.Request(ID,ID,ID,student,"问题","内容","尝试",revision,"[{\"path\":\"answer.md\",\"content\":\"secret\"}]",expires,null,"[]","[]",null,"open",time,time,"student.test","学生");}
}
