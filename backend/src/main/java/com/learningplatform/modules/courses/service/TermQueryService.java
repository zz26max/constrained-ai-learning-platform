package com.learningplatform.modules.courses.service;

import java.util.List;

import com.learningplatform.modules.courses.mapper.TermMapper;
import com.learningplatform.modules.courses.model.Term;
import org.springframework.stereotype.Service;

/** 学期只读入口，供 /me/config 等跨模块查询复用；不在此复制学期业务规则。 */
@Service
public class TermQueryService {

    private final TermMapper termMapper;

    public TermQueryService(TermMapper termMapper) {
        this.termMapper = termMapper;
    }

    /** 全部学期按开始时间降序、ID 升序返回；空库返回空列表。 */
    public List<Term> listAll() {
        return List.copyOf(termMapper.findAllOrdered());
    }
}
