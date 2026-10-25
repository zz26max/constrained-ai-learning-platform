package com.learningplatform.modules.courses.service;

import java.time.Instant;
import com.learningplatform.modules.courses.mapper.AssignmentMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** Assignments owns its policy pointer; tutoring owns immutable policy versions. */
@Service
public class AssignmentPolicyBindingService {
    private final AssignmentMapper mapper;
    public AssignmentPolicyBindingService(AssignmentMapper mapper){this.mapper=mapper;}
    @Transactional(propagation=Propagation.MANDATORY,isolation=Isolation.READ_COMMITTED,rollbackFor=Exception.class)
    public boolean bind(String assignment,String policy,String expected,Instant now) {
        return mapper.bindPolicy(assignment,policy,expected,now)==1;
    }
}
