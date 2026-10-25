package com.learningplatform.modules.notifications;
import java.time.Instant;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
/** Notifications participate in the caller's business transaction. */
@Service
public class NotificationWriter {
 private final NotificationMapper mapper;
 public NotificationWriter(NotificationMapper mapper){this.mapper=mapper;}
 @Transactional(propagation=Propagation.MANDATORY,isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
 public void helpReply(String id,String recipient,String offering,String assignment,String help,String reply,String content,Instant now){mapper.helpReply(id,recipient,offering,assignment,help,reply,content,now);}
}
