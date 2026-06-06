### 当前功能：
- 支持并行抓取多个平台，使用 web-access CDP 技术
- LLM 分析生成 topics/skills/career domains/style/audience/commercial signals
- ProfileSynthesizer 聚合分析结果生成最终 profile
- 支持 Second Me API 同步
- 每个用户输出仍然放在 outputs/ 多个 JSON 文件（需改进为数据库存储）

### 下一步开发目标：
- **Identifier 泛化**：用户可输入任意个，任意平台的账号（但是限于小红书、Github、知乎、LinkedIn），采集器自动识别平台类型
- **多平台并行抓取**：所有输入账号同时触发抓取（web-access技能的并行分治）
- **统一 profile 输出到数据库**：
  - 不再使用零散 JSON 文件
  - 建立所有用户的profile数据库，可存储多用户 profile，并支持随用户信息的丰富而随时更新（比如用户后来又提供了小红书号）
  - ProfileSynthesizer完成之后进行profile embedding，embedding 存入本地向量数据库（FAISS/Milvus），后续实现匹配时可自定义规则：比如某同学寻求量化金融求职的信息，尤其是编程技能薄弱，可以采取行业+技能+经历权重
  - 同步 profile 到 Second Me 作为云端备份和可选匹配，这样可以兼顾 本地精确匹配 和 Second Me 云端同步/备份
- **统一 LLM API key**：
  - 所有平台分析共用同一个 API key
  - 避免每个采集器重复输入
- **前端准备**：
  - 将来可直接前端输入账号，后端流水线并行抓取、分析、聚合 profile
- **完善错误处理与日志**：
  - 某个平台失败不影响其他平台
  - 失败/partial profile 自动记录

### 执行任务要求：
- 理解项目背景和现有多平台采集器架构，将项目的py函数整理到一个或多个文件夹中
- 改造流水线，使用户输入任意平台账号均可触发并行抓取
- 确保 LLM 分析统一使用一个 API key
- 将不同平台输出整合后生成统一 profile
- 支持直接存入数据库，而不是零散 JSON 文件，只存最终结果不存中间结果
- 保持 MultiPlatformCollector / ContentAnalyzer / ProfileSynthesizer 多 Agent 设计
- 保持 SecondMeClient.update_profile() 一键同步功能
- 输出最终 profile，可在数据库中检索

请 Claude Code 在新的对话中：
- 理解上述项目背景、当前进度和目标
- 基于现有 `platform_collectors.py`、`run_multiplatform_extraction.py` 以及 `extract_xhs_profile.py` 架构，生成可执行的 Python 模板代码
- 支持多平台账号输入、并行抓取、LLM 分析、多 Agent 分类、统一 profile 聚合
- 将 profile 存入数据库，并保持 Second Me 同步功能