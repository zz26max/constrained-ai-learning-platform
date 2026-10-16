package com.learningplatform.modules.courses.service;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.dto.AssignmentDTOs.*;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import com.learningplatform.modules.courses.mapper.CourseMapper;
import com.learningplatform.modules.courses.model.AssignmentRows.NoticeRow;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
/** P1-D 公告系统服务 */
@Service
public class NoticeService {
    private final AssignmentMapper mapper;
    private final CourseMapper courseMapper;
    private final CourseAccess access;
    public NoticeService(AssignmentMapper mapper,CourseMapper courseMapper,CourseAccess access) {
        this.mapper=mapper;this.courseMapper=courseMapper;this.access=access;
    }
    @Transactional
    public NoticeDTO createNotice(String offeringId,UserDTO author,NoticeWrite input) {
        access.requireTeacher(author,offeringId,true);
        if(input.targetStudentId()!=null) {
            access.requireReader(author,offeringId);
        }
        String noticeId=UUID.randomUUID().toString();
        Instant now=Instant.now();
        NoticeRow notice=new NoticeRow(noticeId,offeringId,author.id(),input.targetStudentId(),
                input.title(),input.content(),now);
        mapper.insertNotice(notice);
        if(input.targetStudentId()==null) {
            List<String> studentIds=courseMapper.findStudentIdsByOffering(offeringId);
            for(String studentId:studentIds) {
                String msgId=UUID.randomUUID().toString();
                mapper.insertNotification(msgId,studentId,"notice_published",
                        input.title(),input.content(),offeringId,null,null,now);
            }
        }
        return mapper.findNoticeById(noticeId);
    }
    @Transactional(readOnly=true)
    public PagedResult<NoticeDTO> listNotices(String offeringId,UserDTO user,int page,int pageSize) {
        access.requireReader(user,offeringId);
        int offset=(page-1)*pageSize;
        List<NoticeDTO> items=mapper.listNotices(offeringId,offset,pageSize);
        int total=mapper.countNotices(offeringId);
        int totalPages=(total+pageSize-1)/pageSize;
        return new PagedResult<>(items,page,pageSize,total,totalPages,null);
    }
    @Transactional(readOnly=true)
    public NoticeDTO getNotice(String noticeId,UserDTO user) {
        NoticeDTO notice=mapper.findNoticeById(noticeId);
        if(notice==null) throw new com.learningplatform.common.exception.BusinessException(
                org.springframework.http.HttpStatus.NOT_FOUND,"NOT_FOUND","Notice not found");
        access.requireReader(user,notice.offeringId());
        return notice;
    }
}
