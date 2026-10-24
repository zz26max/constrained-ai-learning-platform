# 学生端正式接入交付报告

## 交付结果与入口

正式入口：http://127.0.0.1:4173/#/student/home ，使用现有真实API、会话、CSRF和系统时钟。首页/作业/消息采用V3.6.1，未读默认A；课程/学习记录/学生日历采用V3.5。六页及课程详情、章节、资料、作业详情、工作区、公告列表/详情已衔接。

未发布部署。教师/管理端、后端、数据库结构、权限、API契约和首页排序不变。真实数据读取失败不会降级演示成功。没有为了截图更换现有数据。

历史入口保留：4174的campus.html?explore=v35/v36/v361。历史启动显式固定迁移前路由与版本配置，演示时钟和内存状态只属于该入口。正式界面没有版本开关，也不响应设计评审参数。

## 实现与设计依据

- 共享组件和样式位于features/student/visual：学科身份、消息图形、截止日期、章节进度与进度/时间/资格三维表达。正式页面不导入demo目录。
- 首页明确补交状态，展示依据放在主操作之后，保留现有可提交任务按截止时间排序的规则。未截止优先是否另行调整仍是业务决策。
- 课程筛选/分页为页面局部状态；当前章节动作以实际已发布章节及阅读状态为准。学习记录保留真实评价分页、精确ID去重；日历按北京时间展示，资格读取失败保持未知。
- 学生共享样式统一限定在:where(.student-space)内，零额外选择器权重；二级页基础样式还需正式student-release容器。教师日历继续使用原组件，隔离预览不获得二级页正式样式。
- 生产检查移除“展示类名即演示数据”的误判，保留模拟/演示标记检查，并遍历正式入口依赖图拒绝demo模块。没有删除隔离断言。
- 设计规范已整合frontend/DESIGN.md；不新增API、DTO字段或契约枚举。

## 实际执行与证据

|检查|实际结果与边界|
|---|---|
|npm --prefix frontend run verify|30文件279项通过，类型/构建/生产隔离通过。较原274项新增5项：正式首页资格/失败/空态、正式课程空态与错误、教师日历无学生容器。|
|verify-student-release.mjs|68项通过；六页×1440/1024/768/430/390/375/320共42组合，首/中/底滚动与抽样触控中心命中/44px高度，菜单开关和导航固定位置，二级页面14组合，筛选/分页/日历返回/评价与角色拒绝等；另验证正式首页主按钮的3px键盘焦点与Enter跳转、消息展开不标读和实际月周切换。570个真实响应：569个200，1个初始未登录/me的预期401，无未处理页面异常。|
|verify-zhixue.mjs|本轮真实新建专用验收教学班、章节、邀请码、三类作业；学生加入与阅读、Web/SQL/文字保存提交、教师草稿对学生不可见、发布后评价可见、教师抽屉与响应式检查通过。仅写入这轮专用测试对象，不覆盖原有课程/作业。|
|verify-zhixue-boundaries.mjs|对上述专用对象，双窗口真实409及明确合并、慢网络最新稿保存、保存失败保留与取消离开、Web沙箱父级/存储隔离、真实会话退出与换身份、归档只读、跨班拒绝通过。教师页面未改。|
|真实读取异常|消息GET实际中止后保留错误而非空列表/模拟成功，取消中止并重试恢复；延迟请求保持loading至真实响应；未伪造成功响应。|
|历史候选|V3.5设计86项、V3.6设计64项、V3.6.1浏览器23项通过，历史入口保留。V3.6检查中的534文字样本最低5.13:1属于固定演示基线，不冒充本轮正式六页完整对比度扫描。|
|隔离与契约|verify-campus-isolation：演示API拒绝、正式服务拒绝演示页面/模块、演示生产构建拒绝通过；validate_contract通过83业务+2健康、325schema、41回归。静态校验不等于数据库正确性证明。|

本轮最终生产包：CSS 199.19kB（gzip28.50kB）、JS389.78kB（gzip120.43kB），没有新增依赖或网络字体。相较迁移前CSS103.31/gzip17.19、JS377.14/gzip116.27有所增加；旧基础样式保留以兼容二级页和教师端，未进行无关样式清理或性能评分。

证据目录：
- frontend/.cache/student-release/results.json及六页/二级页/交互PNG。
- frontend/.cache/zhixue/result.json、boundaries.json及真实流程截图；资源ID仅记录本地缓存。
- 根目录临时截图_学生端正式版：当前六页12张、实际视口12张、二级页14张、交互状态6张，仅桌面/手机两档交付。
- frontend/.cache/student-v35、student-v36、student-v361及student-v33/isolation.json。

运行顺序：先启动现有本地MySQL/后端与4173真实前端、4174演示服务；执行verify-zhixue.mjs创建专用对象，再执行verify-zhixue-boundaries.mjs和verify-student-release.mjs。账号配置读取既有backend/.env，脚本不打印口令；截图和缓存均不提交。

## 发现的问题与处置

1. 首次切换首页出现8个旧结构/方案断言失败：旧设计检查显式挂载保留页面，正式路由忽略设计参数；业务断言保留，并新增正式资格/错误/空态断言。
2. 后续课程/记录/日历有7个回归差异：按新DOM更新定位和等价的计数表达，课程动作测试改用真实章节阅读状态；学习记录非法链接说明确实缺失，补回“链接无效”，保留不请求非法对象的断言。
3. 共享组件初次转发在真实浏览器产生空节点；改为有类型props的显式模板转发。可选布尔默认值也显式保留，修复2个时间状态断言失败，历史浏览器重新通过。
4. 新增组合失败测试起初错误假定上游任务失败后仍有课程详情；拆开上游失败和章节失败检查。浏览器检查修正了异步跳转等待与权限页实际标题定位，未修改产品来迎合脚本。
5. 固定导航在长截图中仍可能位于中部，这是全页截图记录固定层的方式；实际滚动和底部操作命中检查通过，未为截图改变导航定位。另提供真实视口截图。

没有通过删除测试或弱化权限、保存、提交断言消除失败。

## 未验证事项与停止边界

- 未执行真实学生测试、真机安全区域/软键盘测试和完整辅助技术审计，不报告成功率或满意度。
- 实际Node v24.17.0，低于项目24.21.0基线；本地结果不等同指定CI环境。没有升级依赖或改工程版本约定。
- 后端代码未变，本轮没有重跑Maven全量；真实浏览器流程不替代所有事务/并发测试。
- 自动浏览器覆盖主要按钮/筛选/滚动与既有边界，未宣称每个交互元素均完成人工键盘审计。
- 不推进教师端设计、新功能或新的视觉探索。当前正式学生端已完成本轮迁移，部署仍由后续发布流程处理。

## 提交、文件与回退

迁移前基线：7ed441c。分包提交：283d3ad（提取展示层）、71c4d3c（三页正式接入）、31555bc（其余三页与二级页）；d6335b8（学生样式边界、最终验收与交付）。最新文档提交仅更新交接基线。

回退正式页面：按逆序git revert d6335b8、31555bc、71c4d3c、283d3ad；若存在后续文档变更，先保留该变更并处理Git提示的文档冲突；保留用户其他未提交工作，不使用硬重置，不删除旧截图。无需数据库迁移/回退；本轮创建的验收对象保留在本地测试环境，未擅自清空。隔离历史预览可随时用于设计对照。

修改文件如下（不含缓存和截图）：
- docs/STATUS.md
- frontend/DESIGN.md
- frontend/STUDENT-RELEASE-DELIVERY.md
- frontend/scripts/check-no-mock.mjs
- frontend/scripts/verify-student-release.mjs
- frontend/scripts/verify-student-v361.mjs
- frontend/src/app/App.vue
- frontend/src/app/router.ts
- frontend/src/demo/campus/start.ts
- frontend/src/demo/campus/visual/CountProgress.vue
- frontend/src/demo/campus/visual/CraftDate.vue
- frontend/src/demo/campus/visual/CraftTaskState.vue
- frontend/src/demo/campus/visual/DeadlineStamp.vue
- frontend/src/demo/campus/visual/IntegratedTaskStatus.vue
- frontend/src/demo/campus/visual/MessageTypeGlyph.vue
- frontend/src/demo/campus/visual/SubjectGlyph.vue
- frontend/src/demo/campus/visual/SubjectIdentity.vue
- frontend/src/demo/campus/visual/craft.css
- frontend/src/demo/campus/visual/integration.css
- frontend/src/demo/campus/visual/polish.css
- frontend/src/demo/campus/visual/presentation.ts
- frontend/src/demo/campus/visual/refinement.css
- frontend/src/demo/campus/visual/refinement.ts
- frontend/src/demo/campus/visual/visual.css
- frontend/src/features/student/visual/CountProgress.vue
- frontend/src/features/student/visual/CraftDate.vue
- frontend/src/features/student/visual/CraftTaskState.vue
- frontend/src/features/student/visual/DeadlineStamp.vue
- frontend/src/features/student/visual/IntegratedTaskStatus.vue
- frontend/src/features/student/visual/MessageTypeGlyph.vue
- frontend/src/features/student/visual/StudentAssignments.vue
- frontend/src/features/student/visual/StudentCalendar.vue
- frontend/src/features/student/visual/StudentCourses.vue
- frontend/src/features/student/visual/StudentHome.vue
- frontend/src/features/student/visual/StudentMessages.vue
- frontend/src/features/student/visual/StudentRecords.vue
- frontend/src/features/student/visual/SubjectGlyph.vue
- frontend/src/features/student/visual/SubjectIdentity.vue
- frontend/src/features/student/visual/craft.css
- frontend/src/features/student/visual/integration.css
- frontend/src/features/student/visual/polish.css
- frontend/src/features/student/visual/presentation.ts
- frontend/src/features/student/visual/refinement.css
- frontend/src/features/student/visual/refinement.ts
- frontend/src/features/student/visual/secondary.css
- frontend/src/features/student/visual/student.css
- frontend/src/features/student/visual/visual.css
- frontend/src/main.ts
- frontend/tests/calendar.test.ts
- frontend/tests/p1d-ui.test.ts
