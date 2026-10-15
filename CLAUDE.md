项目规范以 AGENTS.md 为准；本文件只补充 Claude Code 会话规则。

## 工作流：设计 → 并行实现 → 审查（标准三步法）
**核心理念：主会话轻量化，子代理并行化，上下文隔离化**

### 第一步：Opus 设计方案
主会话切换到 Opus 5.5 进行架构设计：
```bash
/model opus
"设计 P1-X 功能的前后端方案"
```
输出内容：
- 接口契约（HTTP 端点、请求/响应格式）
- 表结构与迁移脚本设计
- 权限规则与业务边界
- 前后端职责划分
- 保存到 `docs/features/p1x-*.md`

**关键要求：** 设计要足够详细，让 Sonnet 子代理能独立实现，不需来回问。

### 第二步：Sonnet 并行实现
主会话切回 Sonnet，派发两个子代理**同时**实现前后端：
```javascript
/model sonnet

// 在同一条消息中派发两个子代理
Agent({
  subagent_type: 'general-purpose',
  model: 'sonnet',
  description: 'P1-X 前端实现',
  prompt: `根据 docs/features/p1x-*.md 的设计，实现前端部分。
  
要求：
- 只读取前端代码库（frontend/ 目录）
- 实现所有 UI 组件、API 调用、状态管理
- 完成后运行 npm --prefix frontend run verify
- 不要读后端代码，避免交叉污染`
})

Agent({
  subagent_type: 'general-purpose',
  model: 'sonnet',
  description: 'P1-X 后端实现',
  prompt: `根据 docs/features/p1x-*.md 的设计，实现后端部分。

要求：
- 只读取后端代码库（backend/ 目录）
- 实现数据层（mapper + XML）、业务层（service）、控制器层（controller）
- 完成后运行 ./mvnw.cmd --batch-mode compile -DskipTests
- 不要读前端代码，避免交叉污染`
})
```

**关键要求：** 
- 两个 Agent 调用必须在同一条消息中，实现真正并行
- 子代理只读各自领域代码，上下文隔离
- 子代理完成后自动返回摘要，不污染主会话

### 第三步：主会话审查与验证
子代理返回后，主会话审查改动：
```bash
# 1. 查看完整 diff
git diff HEAD

# 2. 审查关键点
- 是否符合设计文档？
- 前后端接口契约是否一致？
- 是否有安全漏洞（SQL 注入、XSS 等）？
- 权限检查是否正确？

# 3. 运行验证
cd frontend && npm run verify
cd backend && ./mvnw.cmd --batch-mode verify

# 4. 如有问题，主会话直接修复（小改动）或重新派子代理（大改动）
```

**成本优势：**
- 主会话只保留：设计方案 + 子代理摘要 + diff 审查，上下文极轻量
- 子代理上下文独立且完成后销毁，不占用主会话
- 并行执行节约时间，串行审查保证质量
- 缓存命中率高（主会话上下文稳定）

### 何时使用完整三步法
- 新功能模块（如 P1-A、P1-B、P1-C 等工作包）
- 跨前后端的完整特性
- 需要架构设计的复杂任务

### 何时简化流程
- 纯前端或纯后端的小改动：跳过设计，直接派一个子代理
- Bug 修复：主会话直接改，不派子代理
- 样式调整、文案修改：主会话直接改

## 成本控制（极致节约）
**主会话默认 Sonnet 5.5，只在以下场景提醒用户切 Opus 5.5：**
1. **设计新功能**：讨论方案、表结构、接口契约、权限模型、沙箱策略、AI 受限规则时 → 提醒 `/model opus` 讨论，定完方案后提醒切回 `/model sonnet`。
2. **审查敏感 PR**：涉及认证、授权、权限检查、AI 受限策略实现、沙箱逃逸防护、Flyway 迁移脚本时 → 提醒 `/model opus` 审查。
3. **架构决策**：多方案权衡、安全边界设计、复杂并发控制时 → 提醒用 Opus。

**其他时候一律 Sonnet：**
- 派子代理写代码、跑测试、修 bug：显式传 `Agent(model='sonnet')`。
- 审查普通 CRUD、样式、测试：派 `reviewer` 子代理（默认 sonnet）。
- 搜代码、找文件、梳理调用链：派 `explorer` 子代理（自动用 haiku）。

**杂项成本控制：**
- 验证命令：前端 `npm --prefix frontend run verify`；后端 `./mvnw.cmd --batch-mode verify`。
- 不读 node_modules、dist、build、lock 文件、生成代码（`src/api/generated/`）、日志。
- 超 300 行文件先 Grep 定位再分段读；读过且没改的文件不重复读。
- 命令输出过滤（`| tail -n 50`）；测试只看失败项。
- 改代码用 Edit 不 Write；回复只写结论不复述代码；不写未要求的文档或抽象。

**上下文压缩规范：**
- 每轮任务开始前主动报告上下文使用率（当前 tokens / 200,000）。
- **< 60%**：继续工作。
- **60-80%**：提醒用户「上下文已用 X%，建议完成当前任务后 `/clear` 并更新 `docs/features/<功能>.md` 总结进度，避免后续任务质量下降」。
- **> 80%**：强制提醒「上下文接近上限 (X%)，必须 `/clear` 压缩后再继续，否则影响推理质量和成本」。
- 切换功能模块（如 P1-B → P1-C）时主动建议压缩：「P1-B 已完成，上下文中细节对 P1-C 无用，建议 `/clear` 后从 `docs/features/p1c-*.md` 恢复」。
