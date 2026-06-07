
项目背景说明：

1️⃣ 项目目标：
- 构建一个泛用“校友 Agent”，可从多个社交平台抓取用户内容并生成结构化 profile。
- 支持的社交平台：
  - 小红书（Xiaohongshu）：抓取用户帖子的标题和正文内容
  - GitHub：抓取用户仓库 README
  - LinkedIn：抓取用户公开资料/职位信息
  - 知乎：抓取用户发帖标题
- 输出统一的结构化 profile JSON，并可以直接调用 SecondMeClient.update_profile() 同步到 Second Me 平台。

2️⃣ 项目现状：
- 已有 extract_xhs_profile.py 能通过 web-access CDP 从小红书抓取用户帖子。
- 已去掉硬编码 skill_patterns、body_keywords 等逻辑，通过 LLM 分析帖子内容生成：
  - content_topics（6+ topics）
  - skills_inferred（8+技能）
  - career_domains（4+职业领域）
  - style_profile（写作风格/视觉风格/语气）
  - audience_guess（目标受众）
  - commercial_signals（品牌/产品信号）
- Profile JSON 格式已完成，输出文件包括：
  - raw_notes.json（原始抓取数据）
  - analyzed_signals.json（LLM分析中间结果）
  - final_profile.json（最终结构化 profile）
  - extraction_report.md（可读报告）
- Profile 置信度高（0.95），并支持部分笔记仅标题时生成 partial profile。

3️⃣ 技术细节：
- web-access Skill 已验证可用，并可开启多 Tab / 并行抓取网页。
- 小红书抓取已可批量提取 20 条笔记，其中部分正文通过点击 CDP 页面获得。
- LLM 分析采用大模型 API（GPT 系列）做分类、技能提取、风格分析、受众推理、商业信号识别。
- Profile 结构化标准已统一，可用于 Agent 匹配和分析。
- Second Me API 已封装为 `SecondMeClient`，支持：
  - get_profile()
  - update_profile(Profile)
  - get_embedding()

4️⃣ 下一步开发目标：
- **并行化抓取 / 多平台**：
  - web-access 并行打开多个 Tab，同时抓取用户在不同平台的内容：
    - GitHub：获取各仓库 README 内容
    - LinkedIn：抓取公开职位和简介
    - 知乎：抓取用户发帖标题
- **多 Agent 设计**：
  - NoteCollector Agent：抓取不同平台的内容
  - ContentAnalyzer Agent：调用 LLM API，对帖子/README/标题进行分类、技能抽取、风格分析
  - ProfileSynthesizer Agent：聚合所有信号生成统一结构化 profile
- **一键同步 Second Me**：
  - 完成 profile 聚合后，直接调用 `SecondMeClient.update_profile(profile)` 同步
- **增强泛用性和抓取覆盖率**：
  - 不再假定任何学校、年级、专业
  - 采用 AI 判断而非硬编码规则
  - 提升笔记/帖子抓取的完整性，处理 title-only 或正文可用场景

5️⃣ Claude Code 执行任务要求：
- 基于现有 extract_xhs_profile.py 的 CDP 抓取逻辑保留。
- 新增多平台抓取模块，支持并行 Tab 操作。
- 新增多 Agent 处理流程：NoteCollector → ContentAnalyzer → ProfileSynthesizer。
- LLM 分析逻辑用于泛用化 topic/skill/role/风格/受众/商业信号提取。
- 输出 JSON 文件：
  - raw_notes_all_platforms.json
  - analyzed_signals_all_platforms.json
  - final_profile_all_platforms.json
- 自动调用 `SecondMeClient.update_profile()` 同步。
- 保证错误处理：
  - 部分抓取失败仍生成 partial profile
  - LLM API 调用失败输出警告，不阻塞整体流程
- CLI 接口仍支持用户输入 identifier / display_name_hint / 平台选择。

请 Claude Code 在新的对话中：
- 理解项目背景和当前进度
- 按照下一步开发目标和执行任务要求，生成可执行 Python 模板代码
- 确保多平台抓取、LLM 分析和多 Agent 分类流程完整
- 可直接在项目主目录运行，无需 src/ 或 agents/ 文件夹
- 输出结构化 profile 并一键同步到 Second Me