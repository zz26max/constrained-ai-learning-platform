-- V16: 导入真实 Web 开发基础课程数据（基于 MDN Web Docs 结构手动编写）
-- 所有 INSERT 使用 INSERT IGNORE 保证幂等性；固定 UUID 便于前后端对齐。
-- 迁移不创建账号：个人学习 offering 没有人类创建者，因此 created_by 允许 NULL。
-- 个人学习 offering 需要一个学期承载；空库没有学期时由本迁移补一个当前学期，
-- 已有当前学期时保持原样（个人课程挂到既有当前学期）。

-- 1. 个人学习 offering 不再要求创建者（课程内容随迁移分发，不引入系统账号）
ALTER TABLE course_offerings
    MODIFY created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;

-- 2. 空库兜底当前学期：仅在没有任何当前学期时插入，不覆盖既有学期配置
INSERT IGNORE INTO terms (id, label, starts_at, ends_at, is_current, created_at, updated_at)
SELECT '00000000-0000-4000-8000-000000000010', '个人学习学期', '2026-01-01 00:00:00.000000',
       '2030-01-01 00:00:00.000000', 1, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM terms WHERE is_current = 1);

-- 3. 基础课程：Web 开发基础
INSERT IGNORE INTO courses (id, code, mark, title, description, status, created_by, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000110', 'WEB-101', 'WEB', 'Web 开发基础',
        '本课程涵盖 HTML、CSS、JavaScript 核心知识，适合零基础学习者。内容参考 MDN Web Docs 结构，手动编写原创 Markdown 教程。',
        'active', NULL, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000');

-- 4. 个人课程 offering（所有个人模式用户自动关联）
INSERT IGNORE INTO course_offerings (id, course_id, term_id, title, group_name, progress_unit, status, created_by, created_at, updated_at)
SELECT '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000110', t.id,
       'Web 开发基础（个人学习）', '个人学习', 'chapter', 'active',
       NULL, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'
FROM terms t WHERE t.is_current = 1 LIMIT 1;

-- 4. 章节（5 章）
INSERT IGNORE INTO chapters (id, offering_id, position, title, summary, status, is_required, content_version, published_at, created_at, updated_at)
VALUES
('00000000-0000-4000-8000-000000000310', '00000000-0000-4000-8000-000000000210', 1, 'HTML 基础', '学习 HTML 文档结构与常用标签', 'published', 1, 1, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000210', 2, 'CSS 样式基础', '掌握 CSS 选择器、盒模型与布局', 'published', 1, 1, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000210', 3, 'JavaScript 入门', '学习变量、函数与 DOM 操作', 'published', 1, 1, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
('00000000-0000-4000-8000-000000000313', '00000000-0000-4000-8000-000000000210', 4, '响应式设计', '使用媒体查询与 Flexbox 实现自适应布局', 'published', 1, 1, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
('00000000-0000-4000-8000-000000000314', '00000000-0000-4000-8000-000000000210', 5, '综合实践', '完成个人主页项目', 'published', 1, 1, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000');

-- 5. 知识点（12 个）
INSERT IGNORE INTO knowledge_points (id, offering_id, chapter_id, title, description, position, created_at, updated_at)
VALUES
-- 第1章：HTML 基础（3 个知识点）
('00000000-0000-4000-8000-000000000510', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000310', '文档结构', '理解 HTML 文档的基本结构：DOCTYPE、html、head、body', 1, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000310', '语义化标签', '掌握标题、段落、列表等语义化标签的使用', 2, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
('00000000-0000-4000-8000-000000000512', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000310', '超链接与图片', '使用 a 标签创建链接，img 标签嵌入图片', 3, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
-- 第2章：CSS 样式基础（3 个知识点）
('00000000-0000-4000-8000-000000000513', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000311', '选择器优先级', '理解元素、类、ID 选择器及优先级规则', 1, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
('00000000-0000-4000-8000-000000000514', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000311', '盒模型', '掌握 margin、padding、border 与 content 区域', 2, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
('00000000-0000-4000-8000-000000000515', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000311', 'Flexbox 布局', '使用 Flexbox 实现弹性布局', 3, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
-- 第3章：JavaScript 入门（3 个知识点）
('00000000-0000-4000-8000-000000000516', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000312', '变量与数据类型', '使用 let、const 声明变量，理解基本数据类型', 1, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
('00000000-0000-4000-8000-000000000517', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000312', '函数定义', '掌握函数声明、参数与返回值', 2, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
('00000000-0000-4000-8000-000000000518', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000312', '事件处理', '使用 addEventListener 处理用户交互', 3, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
-- 第4章：响应式设计（2 个知识点）
('00000000-0000-4000-8000-000000000519', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000313', '媒体查询', '使用 @media 规则适配不同设备', 1, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
('00000000-0000-4000-8000-000000000520', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000313', 'Flexbox 实践', '综合运用 Flexbox 实现导航栏等组件', 2, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),
-- 第5章：综合实践（1 个知识点）
('00000000-0000-4000-8000-000000000521', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000314', '项目结构', '组织 HTML、CSS、JS 代码构建完整项目', 1, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000');

-- 6. 资源（10 份 Markdown 教程）
-- 第1章：HTML 基础（2 份资源）
INSERT IGNORE INTO resources (id, offering_id, chapter_id, knowledge_point_id, title, content_markdown, position, status, created_at, updated_at)
VALUES
('00000000-0000-4000-8000-000000000410', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000310', '00000000-0000-4000-8000-000000000510', 'HTML 文档结构',
'## HTML 文档结构\n\n每个 HTML 文档都遵循相同的基本结构。理解这个结构是 Web 开发的第一步。\n\n### 基本模板\n\n```html\n<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>页面标题</title>\n</head>\n<body>\n    <!-- 页面内容 -->\n</body>\n</html>\n```\n\n### 各部分说明\n\n| 标签 | 作用 |\n|------|------|\n| `<!DOCTYPE html>` | 声明文档类型为 HTML5 |\n| `<html>` | 根元素，包裹所有内容 |\n| `<head>` | 包含元数据（标题、字符集、样式等） |\n| `<body>` | 包含可见的页面内容 |\n\n### 练习要点\n\n1. 创建一个空的 HTML 文件，包含上述基本结构\n2. 在 `<title>` 中填写你的页面标题\n3. 在 `<body>` 中添加一行文字，用浏览器打开查看效果',
1, 'active', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),

('00000000-0000-4000-8000-000000000411', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000310', '00000000-0000-4000-8000-000000000511', '常用 HTML 标签',
'## 常用 HTML 标签\n\nHTML 提供丰富的标签来组织内容。掌握常用标签是构建网页的基础。\n\n### 文本标签\n\n```html\n<!-- 标题：h1 最大，h6 最小 -->\n<h1>主标题</h1>\n<h2>二级标题</h2>\n\n<!-- 段落与换行 -->\n<p>这是一个段落。</p>\n<p>第一行<br>第二行</p>\n\n<!-- 列表 -->\n<ul>\n    <li>无序列表项</li>\n</ul>\n<ol>\n    <li>有序列表项</li>\n</ol>\n```\n\n### 链接与图片\n\n```html\n<!-- 超链接 -->\n<a href="https://example.com">访问示例</a>\n\n<!-- 图片 -->\n<img src="image.jpg" alt="图片描述">\n```\n\n### 语义化标签\n\n使用有意义的标签描述内容：\n\n- `<header>` 页眉\n- `<nav>` 导航\n- `<main>` 主要内容\n- `<article>` 文章\n- `<section>` 章节\n- `<footer>` 页脚\n\n### 练习要点\n\n1. 用标题和段落写一段自我介绍\n2. 创建一个包含 3 项的购物清单（无序列表）\n3. 添加一个链接到你喜欢的网站',
2, 'active', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000');

-- 第2章：CSS 样式基础（2 份资源）
INSERT IGNORE INTO resources (id, offering_id, chapter_id, knowledge_point_id, title, content_markdown, position, status, created_at, updated_at)
VALUES
('00000000-0000-4000-8000-000000000412', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000513', 'CSS 选择器与属性',
'## CSS 选择器与属性\n\nCSS 用于控制网页的视觉呈现。选择器决定样式应用到哪些元素。\n\n### 基本选择器\n\n```css\n/* 元素选择器 */\np { color: blue; }\n\n/* 类选择器 */\n.highlight { background: yellow; }\n\n/* ID 选择器 */\n#header { font-size: 24px; }\n\n/* 属性选择器 */\ninput[type="text"] { border: 1px solid gray; }\n```\n\n### 优先级规则\n\n当多个规则作用于同一元素时，按以下优先级：\n\n1. `!important` 声明（避免使用）\n2. 内联样式（`style` 属性）\n3. ID 选择器（`#id`）\n4. 类、属性、伪类选择器（`.class`）\n5. 元素、伪元素选择器（`div`）\n\n### 常用属性\n\n```css\n/* 文本 */\ncolor: #333;\nfont-size: 16px;\nfont-weight: bold;\ntext-align: center;\n\n/* 背景 */\nbackground-color: #f0f0f0;\nbackground-image: url("bg.jpg");\n\n/* 边框 */\nborder: 1px solid #ccc;\nborder-radius: 4px;\n```\n\n### 练习要点\n\n1. 为段落设置字体颜色和大小\n2. 用类选择器为按钮添加悬停效果\n3. 使用 ID 选择器设置页面标题样式',
1, 'active', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),

('00000000-0000-4000-8000-000000000413', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000514', '盒模型与布局',
'## 盒模型与布局\n\n每个 HTML 元素都是一个矩形盒子，由 content、padding、border、margin 组成。\n\n### 盒模型结构\n\n```\n┌─────────────────────┐\n│       margin        │\n│  ┌───────────────┐  │\n│  │    border     │  │\n│  │  ┌─────────┐  │  │\n│  │  │ padding │  │  │\n│  │  │ ┌─────┐ │  │  │\n│  │  │ │content│ │  │  │\n│  │  │ └─────┘ │  │  │\n│  │  └─────────┘  │  │\n│  └───────────────┘  │\n└─────────────────────┘\n```\n\n### CSS 代码\n\n```css\n.box {\n    width: 200px;           /* content 宽度 */\n    padding: 20px;          /* 内边距 */\n    border: 2px solid #333; /* 边框 */\n    margin: 10px;           /* 外边距 */\n    \n    /* 推荐：让 width 包含 padding 和 border */\n    box-sizing: border-box;\n}\n```\n\n### display 属性\n\n| 值 | 说明 |\n|----|------|\n| `block` | 块级元素，独占一行（div、p、h1） |\n| `inline` | 行内元素，不换行（span、a） |\n| `inline-block` | 行内块，可设置宽高 |\n| `none` | 隐藏元素 |\n\n### 练习要点\n\n1. 为一个 div 设置 width、padding、border、margin\n2. 使用 `box-sizing: border-box` 理解盒模型计算\n3. 尝试 `display: inline-block` 让元素水平排列',
2, 'active', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000');

-- 第3章：JavaScript 入门（3 份资源）
INSERT IGNORE INTO resources (id, offering_id, chapter_id, knowledge_point_id, title, content_markdown, position, status, created_at, updated_at)
VALUES
('00000000-0000-4000-8000-000000000414', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000516', '变量与数据类型',
'## 变量与数据类型\n\nJavaScript 使用变量存储数据。理解数据类型是编程的基础。\n\n### 声明变量\n\n```javascript\n// 推荐使用 const（常量）和 let（变量）\nconst name = "张三";      // 不可重新赋值\nlet age = 20;             // 可以重新赋值\nage = 21;                 // OK\n\n// 避免使用 var（旧语法，有作用域问题）\nvar oldWay = "不推荐";\n```\n\n### 基本数据类型\n\n```javascript\n// 字符串（String）\nconst greeting = "你好";\nconst fullName = "我叫" + name + "，今年" + age + "岁";  // 字符串拼接\n\n// 数字（Number）\nconst price = 99.5;\nconst count = 10;\n\n// 布尔值（Boolean）\nconst isActive = true;\nconst isDeleted = false;\n\n// 空值\nconst empty = null;       // 有意为空\nlet notDefined;           // undefined（未赋值）\n```\n\n### 类型检查\n\n```javascript\ntypeof "hello"    // "string"\ntypeof 42         // "number"\ntypeof true       // "boolean"\ntypeof null       // "object"（历史遗留 bug）\ntypeof undefined  // "undefined"\n```\n\n### 练习要点\n\n1. 用 `const` 声明你的姓名和年龄\n2. 使用字符串拼接输出一句自我介绍\n3. 尝试修改 `let` 变量，观察 `const` 变量不可修改',
1, 'active', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),

('00000000-0000-4000-8000-000000000415', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000517', '函数与作用域',
'## 函数与作用域\n\n函数是可复用的代码块。理解作用域有助于避免变量冲突。\n\n### 函数声明\n\n```javascript\n// 函数声明（会提升）\nfunction greet(name) {\n    return "你好，" + name + "！";\n}\n\nconsole.log(greet("小明"));  // "你好，小明！"\n\n// 函数表达式\nconst add = function(a, b) {\n    return a + b;\n};\n\n// 箭头函数（推荐）\nconst multiply = (a, b) => a * b;\nconst square = x => x * x;  // 单参数可省略括号\n```\n\n### 参数与返回值\n\n```javascript\n// 默认参数\nfunction createUser(name, role = "student") {\n    return { name, role };\n}\n\ncreateUser("张三");           // { name: "张三", role: "student" }\ncreateUser("李四", "teacher"); // { name: "李四", role: "teacher" }\n\n// 返回多个值（用对象或数组）\nfunction getMinMax(arr) {\n    return { min: Math.min(...arr), max: Math.max(...arr) };\n}\n```\n\n### 作用域\n\n```javascript\nconst global = "全局";\n\nfunction outer() {\n    const outerVar = "外层";\n    \n    function inner() {\n        const innerVar = "内层";\n        console.log(global);    // OK：可访问全局\n        console.log(outerVar);  // OK：可访问外层\n        console.log(innerVar);  // OK：自己的变量\n    }\n    \n    inner();\n    // console.log(innerVar);  // 错误：无法访问内层\n}\n```\n\n### 练习要点\n\n1. 写一个计算圆面积的函数\n2. 用箭头函数重写一个现有函数\n3. 理解为什么内层函数可以访问外层变量',
2, 'active', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),

('00000000-0000-4000-8000-000000000416', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000518', 'DOM 操作',
'## DOM 操作\n\nDOM（文档对象模型）让 JavaScript 能够动态修改网页内容。\n\n### 选择元素\n\n```javascript\n// 推荐：CSS 选择器\nconst header = document.querySelector("#header");\nconst buttons = document.querySelectorAll(".btn");\n\n// 其他方法\nconst byId = document.getElementById("myId");\nconst byClass = document.getElementsByClassName("myClass");\n```\n\n### 修改内容与样式\n\n```javascript\nconst element = document.querySelector("#demo");\n\n// 修改文本\nelement.textContent = "新文本";\nelement.innerText = "纯文本";  // 会解析样式\n\n// 修改 HTML\nelement.innerHTML = "<strong>加粗</strong>";\n\n// 修改样式\nelement.style.color = "red";\nelement.style.backgroundColor = "#f0f0f0";\n\n// 修改类名\nelement.classList.add("active");\nelement.classList.remove("hidden");\nelement.classList.toggle("open");\n```\n\n### 事件处理\n\n```javascript\nconst button = document.querySelector("#myButton");\n\n// 点击事件\nbutton.addEventListener("click", (event) => {\n    console.log("按钮被点击了！");\n    event.target.textContent = "已点击";\n});\n\n// 常用事件\n// - click：点击\n// - input：输入框变化\n// - submit：表单提交\n// - keydown / keyup：键盘按键\n// - mouseover / mouseout：鼠标悬停\n```\n\n### 创建与删除元素\n\n```javascript\n// 创建新元素\nconst newDiv = document.createElement("div");\nnewDiv.textContent = "我是新元素";\nnewDiv.classList.add("card");\n\n// 添加到页面\ndocument.body.appendChild(newDiv);\n\n// 删除元素\nnewDiv.remove();\n```\n\n### 练习要点\n\n1. 用 `querySelector` 获取一个元素并修改其文本\n2. 为按钮添加点击事件，点击后弹出提示\n3. 动态创建一个列表项并添加到 `<ul>` 中',
3, 'active', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000');

-- 第4章：响应式设计（2 份资源）
INSERT IGNORE INTO resources (id, offering_id, chapter_id, knowledge_point_id, title, content_markdown, position, status, created_at, updated_at)
VALUES
('00000000-0000-4000-8000-000000000417', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000313', '00000000-0000-4000-8000-000000000519', '媒体查询',
'## 媒体查询\n\n媒体查询让网页能够根据不同设备（手机、平板、桌面）调整布局。\n\n### 基本语法\n\n```css\n/* 当屏幕宽度小于等于 768px 时应用 */\n@media (max-width: 768px) {\n    .container {\n        flex-direction: column;\n    }\n}\n\n/* 当屏幕宽度大于等于 1024px 时应用 */\n@media (min-width: 1024px) {\n    .container {\n        max-width: 960px;\n        margin: 0 auto;\n    }\n}\n```\n\n### 移动优先策略\n\n推荐从小屏幕开始设计，逐步增强：\n\n```css\n/* 基础样式（手机） */\n.nav {\n    display: flex;\n    flex-direction: column;\n}\n\n/* 平板 */\n@media (min-width: 768px) {\n    .nav {\n        flex-direction: row;\n    }\n}\n\n/* 桌面 */\n@media (min-width: 1024px) {\n    .nav {\n        max-width: 1200px;\n    }\n}\n```\n\n### 常用断点\n\n| 设备 | 宽度范围 |\n|------|----------|\n| 手机 | < 768px |\n| 平板 | 768px - 1023px |\n| 桌面 | >= 1024px |\n| 大屏 | >= 1440px |\n\n### 视口设置\n\n在 HTML `<head>` 中添加：\n\n```html\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n```\n\n### 练习要点\n\n1. 为一个导航栏添加移动端垂直排列、桌面端水平排列\n2. 使用 `min-width` 实现移动优先的响应式布局\n3. 测试你的页面在手机、平板、桌面三种尺寸下的显示效果',
1, 'active', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000'),

('00000000-0000-4000-8000-000000000418', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000313', '00000000-0000-4000-8000-000000000520', 'Flexbox 布局实践',
'## Flexbox 布局实践\n\nFlexbox 是 CSS3 引入的一维布局模型，非常适合组件布局和导航栏等场景。\n\n### 基本概念\n\n```css\n.container {\n    display: flex;           /* 启用 Flexbox */\n    flex-direction: row;     /* 主轴方向：row | column */\n    justify-content: center; /* 主轴对齐 */\n    align-items: center;     /* 交叉轴对齐 */\n}\n```\n\n### 主轴对齐（justify-content）\n\n| 值 | 效果 |\n|----|------|\n| `flex-start` | 靠左对齐 |\n| `flex-end` | 靠右对齐 |\n| `center` | 居中 |\n| `space-between` | 两端对齐，项目间等距 |\n| `space-around` | 每个项目两侧间距相等 |\n\n### 交叉轴对齐（align-items）\n\n| 值 | 效果 |\n|----|------|\n| `stretch` | 拉伸填满（默认） |\n| `flex-start` | 靠上对齐 |\n| `flex-end` | 靠下对齐 |\n| `center` | 垂直居中 |\n\n### 导航栏示例\n\n```html\n<nav class="navbar">\n    <div class="logo">Logo</div>\n    <ul class="menu">\n        <li><a href="#">首页</a></li>\n        <li><a href="#">课程</a></li>\n        <li><a href="#">关于</a></li>\n    </ul>\n</nav>\n```\n\n```css\n.navbar {\n    display: flex;\n    justify-content: space-between;\n    align-items: center;\n    padding: 1rem 2rem;\n    background: #333;\n    color: white;\n}\n\n.menu {\n    display: flex;\n    list-style: none;\n    gap: 2rem;\n}\n\n.menu a {\n    color: white;\n    text-decoration: none;\n}\n\n/* 移动端适配 */\n@media (max-width: 768px) {\n    .navbar {\n        flex-direction: column;\n    }\n    .menu {\n        flex-direction: column;\n        gap: 1rem;\n    }\n}\n```\n\n### 练习要点\n\n1. 用 Flexbox 实现一个水平居中的卡片布局\n2. 创建响应式导航栏（桌面水平，移动端垂直）\n3. 使用 `gap` 属性控制项目间距',
2, 'active', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000');

-- 第5章：综合实践（1 份资源）
INSERT IGNORE INTO resources (id, offering_id, chapter_id, knowledge_point_id, title, content_markdown, position, status, created_at, updated_at)
VALUES
('00000000-0000-4000-8000-000000000419', '00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000314', '00000000-0000-4000-8000-000000000521', '个人主页项目',
'## 个人主页项目\n\n综合运用 HTML、CSS、JavaScript 知识，构建一个完整的个人主页。\n\n### 项目结构\n\n```\nmy-portfolio/\n├── index.html       # 主页\n├── style.css        # 样式\n├── script.js        # 交互逻辑\n└── images/          # 图片资源\n    └── avatar.jpg\n```\n\n### HTML 结构\n\n```html\n<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>我的个人主页</title>\n    <link rel="stylesheet" href="style.css">\n</head>\n<body>\n    <header class="hero">\n        <img src="images/avatar.jpg" alt="头像" class="avatar">\n        <h1>张三</h1>\n        <p class="tagline">Web 开发学习者</p>\n    </header>\n    \n    <main>\n        <section class="about">\n            <h2>关于我</h2>\n            <p>热爱编程，正在学习 Web 开发技术。</p>\n        </section>\n        \n        <section class="skills">\n            <h2>技能</h2>\n            <ul>\n                <li>HTML5</li>\n                <li>CSS3</li>\n                <li>JavaScript</li>\n            </ul>\n        </section>\n        \n        <section class="contact">\n            <h2>联系我</h2>\n            <button id="contactBtn">发送邮件</button>\n        </section>\n    </main>\n    \n    <footer>\n        <p>&copy; 2026 张三</p>\n    </footer>\n    \n    <script src="script.js"></script>\n</body>\n</html>\n```\n\n### CSS 样式\n\n```css\n* {\n    margin: 0;\n    padding: 0;\n    box-sizing: border-box;\n}\n\nbody {\n    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\n    line-height: 1.6;\n    color: #333;\n}\n\n.hero {\n    text-align: center;\n    padding: 4rem 2rem;\n    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n    color: white;\n}\n\n.avatar {\n    width: 150px;\n    height: 150px;\n    border-radius: 50%;\n    border: 4px solid white;\n    margin-bottom: 1rem;\n}\n\nmain {\n    max-width: 800px;\n    margin: 0 auto;\n    padding: 2rem;\n}\n\nsection {\n    margin-bottom: 3rem;\n}\n\nh2 {\n    color: #667eea;\n    margin-bottom: 1rem;\n}\n\n.skills ul {\n    display: flex;\n    gap: 1rem;\n    list-style: none;\n}\n\n.skills li {\n    background: #f0f0f0;\n    padding: 0.5rem 1rem;\n    border-radius: 4px;\n}\n\nbutton {\n    background: #667eea;\n    color: white;\n    border: none;\n    padding: 0.75rem 1.5rem;\n    border-radius: 4px;\n    cursor: pointer;\n}\n\nbutton:hover {\n    background: #764ba2;\n}\n\nfooter {\n    text-align: center;\n    padding: 2rem;\n    background: #f0f0f0;\n}\n\n/* 响应式 */\n@media (max-width: 768px) {\n    .skills ul {\n        flex-direction: column;\n    }\n}\n```\n\n### JavaScript 交互\n\n```javascript\n// 按钮点击事件\ndocument.getElementById("contactBtn").addEventListener("click", () => {\n    alert("请发送邮件到：zhangsan@example.com");\n});\n\n// 页面加载完成后执行\ndocument.addEventListener("DOMContentLoaded", () => {\n    console.log("页面加载完成！");\n});\n```\n\n### 练习要点\n\n1. 按照上述结构创建你的个人主页\n2. 替换内容为你自己的信息\n3. 添加更多章节（项目展示、博客文章等）\n4. 确保在手机和桌面设备上都能正常显示',
1, 'active', '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000');
