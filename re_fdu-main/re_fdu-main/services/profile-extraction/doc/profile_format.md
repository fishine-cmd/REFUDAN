## 1️⃣ 校友 Agent 用户结构化 Profile 设计

Profile 的核心目标是 **便于匹配、便于个性化服务、可持续更新**。推荐字段如下：

### 基础信息（必填/用户填写）

| 字段                | 类型     | 描述       |
| ----------------- | ------ | -------- |
| `user_id`         | string | 内部唯一 ID  |
| `name`            | string | 用户姓名或昵称  |
| `avatar_url`      | string | 用户头像 URL |
| `gender`          | enum   | 男/女/其他   |
| `birth_year`      | int    | 出生年份     |
| `enrollment_year` | int    | 入学年份     |
| `major`           | string | 专业/方向    |
| `grade`           | string | 年级       |

### 教育与发展目标

| 字段                | 类型           | 描述                |
| ----------------- | ------------ | ----------------- |
| `career_goal`     | string       | 未来目标（保研/考研/就业/出国） |
| `target_industry` | string       | 期望行业或研究方向         |
| `skills`          | list[string] | 核心技能（编程、竞赛、社团等）   |
| `languages`       | list[string] | 外语能力              |

### 兴趣与个性（匹配用）

| 字段                   | 类型           | 描述         |
| -------------------- | ------------ | ---------- |
| `interests`          | list[string] | 兴趣标签       |
| `personality_traits` | list[string] | MBTI 或自主标签 |
| `hobbies`            | list[string] | 爱好、课外活动    |

### 外部账号与数字身份

| 字段                | 类型     | 描述                                       |
| ----------------- | ------ | ---------------------------------------- |
| `social_accounts` | dict   | 微信公众号/小红书/GitHub 等，key:平台, value:账号或 URL |
| `second_me_id`    | string | Second Me 平台 ID，用于调用 API                 |

### 履历与成就

| 字段             | 类型         | 描述                                          |
| -------------- | ---------- | ------------------------------------------- |
| `resume_file`  | string     | 用户上传的 PDF/Word 文件路径或存储 URL                  |
| `achievements` | list[dict] | 比赛、论文、项目等，包含 `title`, `description`, `date` |

### 匹配相关指标（Agent 内部计算）

| 字段                 | 类型       | 描述               |
| ------------------ | -------- | ---------------- |
| `similarity_score` | float    | 与其他 Agent 匹配的综合分 |
| `access_count`     | int      | 被其他 Agent 访问次数   |
| `last_update`      | datetime | Profile 最近更新时间   |

---

## 2️⃣ Profile 数据结构示例（JSON）

```json
{
  "user_id": "U123456",
  "name": "张三",
  "avatar_url": "https://example.com/avatar.jpg",
  "gender": "男",
  "birth_year": 2002,
  "enrollment_year": 2020,
  "major": "计算机科学与技术",
  "grade": "大三",
  "career_goal": "保研",
  "target_industry": "人工智能",
  "skills": ["Python", "机器学习", "算法竞赛"],
  "languages": ["英语", "日语"],
  "interests": ["AI", "开源", "篮球"],
  "personality_traits": ["INTJ", "逻辑性强"],
  "hobbies": ["跑步", "阅读"],
  "social_accounts": {
    "xiaohongshu": "193190562",
    "github": "zhangsan",
    "wechat_public": "ZhangSanTech"
  },
  "second_me_id": "SM_987654",
  "resume_file": "/uploads/resume_zhangsan.pdf",
  "achievements": [
    {
      "title": "全国大学生数学建模竞赛二等奖",
      "description": "团队项目，参与数据建模",
      "date": "2023-08-15"
    }
  ],
  "similarity_score": 0.0,
  "access_count": 3,
  "last_update": "2026-05-17T10:00:00Z"
}
```

---

## 3️⃣ 是否需要接入 Second Me API

Second Me 的 API 文档显示，它支持 **个性化蒸馏/用户画像丰富化**：

* 可自动从多平台抓取信息并生成向量化用户画像
* 提供 **OAuth2 认证**、**个人信息增量同步**、**多模态信息融合**接口
* 可返回可直接用于匹配的结构化数据或 embedding

**结论**：推荐接入 Second Me API，作用如下：

1. **快速完成基础 profile 蒸馏**

   * 用户上传 resume + 授权绑定账号 → Second Me 生成初步 profile embedding
2. **持续更新用户画像**

   * Agent 可以周期性调用 Second Me API 更新兴趣/技能权重
3. **匹配优化**

   * 可以直接利用 API 返回的向量化信息进行 Agent-to-Agent 相似度计算

---

## 4️⃣ Second Me API 接入建议

### a. 用户授权流程

1. 用户在校友 Agent 首次绑定 Second Me → 跳转 OAuth2 登录页

   * 请求 `client_id`、`redirect_uri`、`scope`
2. Second Me 返回 `authorization_code`
3. 校友 Agent 后端用 `authorization_code` 换 `access_token`
4. access_token 存储在 Agent 系统，用于后续 API 调用

### b. API 调用示例

* **获取用户 profile**：

```http
GET /v1/users/me
Authorization: Bearer <access_token>
```

* **上传或更新资料**：

```http
POST /v1/users/me/profile
Content-Type: application/json
Authorization: Bearer <access_token>

{
  "resume_url": "...",
  "social_accounts": {...},
  "interests": [...],
  "skills": [...]
}
```

* **获取 embedding/向量化数据**：

```http
GET /v1/users/me/embedding
Authorization: Bearer <access_token>
```

---

## 5️⃣ 总结方案

1. **Profile 统一格式**：基础信息、教育目标、兴趣个性、社交账号、履历与成就、匹配指标
2. **Second Me API**：推荐接入，主要用于 profile 蒸馏和向量化匹配
3. **系统工作流**：

```
用户输入/上传 → 校友 Agent 收集 → Second Me API 增强 → 内部 profile 生成/更新 → Agent-to-Agent 匹配
```

4. **隐私控制**：用户可选择哪些信息用于匹配；Second Me API 调用应遵循 OAuth2 机制，避免泄露敏感信息

---

