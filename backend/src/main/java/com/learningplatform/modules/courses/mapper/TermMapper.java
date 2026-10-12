package com.learningplatform.modules.courses.mapper;

import java.util.List;

import com.learningplatform.modules.courses.model.Term;
import org.apache.ibatis.annotations.Mapper;

/** 学期只读查询；创建与切换学期由后续受控管理流程负责。 */
@Mapper
public interface TermMapper {

    List<Term> findAllOrdered();
}
