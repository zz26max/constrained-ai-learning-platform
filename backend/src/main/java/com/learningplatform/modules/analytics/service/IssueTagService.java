package com.learningplatform.modules.analytics.service;

import java.util.*;
import com.learningplatform.modules.analytics.mapper.LearningEventMapper;
import com.learningplatform.modules.auth.dto.UserDTO;
import com.learningplatform.modules.courses.service.*;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

@Service
public class IssueTagService {
    private final LearningEventMapper mapper;
    private final CourseAccess access;
    private final JsonMapper json;
    public IssueTagService(LearningEventMapper mapper,CourseAccess access,JsonMapper json) {
        this.mapper=mapper;this.access=access;this.json=json;
    }
    public Map<String,Object> get(UserDTO user,String offeringId) {
        access.requireReader(user,offeringId);
        return configuration(offeringId);
    }
    @SuppressWarnings("unchecked")
    public Map<String,Object> configuration(String offeringId) {
        String raw=mapper.tags(offeringId);
        if(raw==null) return Map.of("version",1,"items",List.of(
                Map.of("tag","layout_overflow","title","布局溢出","description","窄屏或内容变化时布局溢出"),
                Map.of("tag","flex_alignment","title","弹性对齐","description","Flex 对齐或分布问题"),
                Map.of("tag","box_model","title","盒模型","description","内边距、边框或宽度计算问题")));
        return json.readValue(raw,Map.class);
    }
    public int validate(String offeringId,List<String> tags) {
        var config=configuration(offeringId);
        var known=new HashSet<String>();
        for(Object item:(List<?>)config.get("items")) known.add((String)((Map<?,?>)item).get("tag"));
        if(new HashSet<>(tags).size()!=tags.size()||!known.containsAll(tags))
            throw AssignmentInput.invalidField("issueTags","必须选择本班受控词表中的不重复标签。");
        return ((Number)config.get("version")).intValue();
    }
}
