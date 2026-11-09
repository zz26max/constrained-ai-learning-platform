# 实验语料（E1 固定输入）

本目录存放实验用的固定题目集，是 `docs/features/experiment-protocol.md` 第 4 节「测试集」的实体。语料随代码入库、可评审；运行产生的模型输出与判定结果写到被 Git 忽略的 `.cache/experiments/`。

## 进度

| 类别 | 文件名 | 目标 | 当前 |
| --- | --- | --- | --- |
| HTML 结构 | `html.json` | 10 | 3 |
| CSS 盒模型/选择器 | `css.json` | 10 | 3 |
| 事件绑定 | `event.json` | 10 | 2 |
| SQL | `sql.json` | 10 | 2 |
| **合计** | | **40** | **10** |

当前 10 题是先给评审确认口径的样板。口径确认后按同样格式补齐到 40 题，**未补齐前不开始 E1 正式采集**。

## 单题格式（schemaVersion 1）

```jsonc
{
  "id": "css-001",                  // 类别-三位序号，与所在文件类别一致
  "title": "按钮样式完全不生效",       // 一行摘要，用于结果表
  "prompt": "学生第一句描述……",       // 触发场景；不含正确答案
  "files": {                        // 学生当前代码：路径 → 内容
    "index.html": "……",
    "style.css": "……"
  },
  "defect": {
    "type": "selector-mismatch",    // 缺陷类型，供 M4 定位准确率按类型统计
    "file": "style.css",            // 金标准：缺陷所在文件
    "line": 1,                      // 金标准：缺陷所在行（1 起）
    "excerpt": ".submit {background:", // 该行必须包含的片段，用于防止行号漂移
    "description": "……"             // 人工评审用的完整说明；不发给模型
  },
  "variants": {
    "hint": "只要提示的问法",
    "direct": "直接索要答案的问法",
    "multiTurn": ["第一轮", "第二轮", "第三轮"]
  }
}
```

## 书写规则

1. **一题一个主缺陷**：便于把「定位准确率」算成 0/1；附带的小瑕疵写进 `description`，不作为评分点。
2. **代码可读且可运行**：HTML 能渲染、SQL 能执行到缺陷处；不要用伪代码。
3. **`excerpt` 必须真实出现在 `line` 行**：由 `scripts/experiment-corpus.mjs` 自动核对，行号漂移会直接报错。
4. **问法三档对应不同指标**：`hint` 测引导率（M3），`direct` 测泄漏率（M1），`multiTurn` 测「拆成多轮要答案」时的拦截（M1/M7）。
5. **不要把金标准写进问法**：`prompt` 只描述现象，不提「选择器」「box-sizing」这类答案词。
6. **不引用真人数据**：示例里的姓名、学号一律虚构（张三、示例班级）。

## 校验

```powershell
node scripts/experiment-corpus.mjs            # 校验全部语料并打印统计
node scripts/experiment-corpus.mjs --self-test # 额外用负例自检校验器本身
```

校验内容：JSON 可解析、`schemaVersion`、id 唯一且与类别前缀一致、必填字段、`defect.file` 存在于 `files`、`line` 在范围内且该行包含 `excerpt`、三档问法非空。任一失败退出码 1。

## 使用方式（待 E1 运行器接入）

- 每个 `item × variant` 组成一个用例；`multiTurn` 按顺序逐轮发送，共享同一会话。
- 对照组 A 用同一套代码与问法，只去掉系统约束；实验组 B 走真实后端。
- 判定按 `docs/features/experiment-protocol.md` 第 6 节的 rubric；`defect` 只给评审者，不进模型上下文。
