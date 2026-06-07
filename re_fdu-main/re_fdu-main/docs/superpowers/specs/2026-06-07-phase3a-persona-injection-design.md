# Phase 3a: 提取画像注入对话 persona（"AI 真懂用户"）

**日期**：2026-06-07
**分支**：`feat/secondme-integration`
**前置**：Phase 1（GitHub 端到端） + Phase 2（XHS Playwright）已落地

---

## 关键术语澄清

> **这不是模型训练。**
>
> 我们做的是：把 Phase 2 抽出来的 `builtProfile` JSON（含话题、技能、风格、教育等）按规则提炼成一段中文 system prompt，每次对话前注入。DeepSeek 收到这个个性化的 system prompt 后，会以那个人的口吻 / 知识聚焦回应。底层 DeepSeek 权重不变。
>
> 这是 **RAG 风格的上下文注入 / Prompt Engineering**，不是 fine-tuning。
>
> 用户感受层面接近"真训练"——agent 真的知道用户的话题、技能、过往——但成本是一次对话 < 100ms 拼字符串，不是真训练 LLM 那种需要大量算力 + 时间 + 数据集准备。
>
> 项目本身的"复见"叙事不需要真训练即可成立：用户感受到分身真懂自己即可。

## 范围

**包含**：
- 前端：`agent-workbench/page.tsx` 持久化 `builtProfile` 到 localStorage；对话时把 `builtProfile` 传给后端
- 后端：`/api/chat` 收到 `builtProfile` 时从中派生 persona + extraContext，注入 system prompt
- UI：profile-build 结果卡片旁加"清除画像"按钮，方便测试和换号

**不包含**：
- BYOK（用户自填 LLM key）—— 用户改主意,统一用服务器端 DeepSeek
- 多用户账号 / 数据库
- 真模型训练 / fine-tuning
- 学长 vs 学弟角色分叉
- builtProfile 多份切换（一次只有一份当前的）

## 改动清单

### 前端：`apps/site/src/app/agent-workbench/page.tsx`

1. **mount 时从 localStorage 恢复 builtProfile**
   ```ts
   useEffect(() => {
     try {
       const raw = localStorage.getItem("refudan.builtProfile");
       if (raw) setBuiltProfile(JSON.parse(raw));
     } catch { /* ignore corruption */ }
   }, []);
   ```

2. **handleGenerate 成功后写 localStorage**
   ```ts
   if (res.ok && data.profile) {
     setBuiltProfile(data.profile);
     localStorage.setItem("refudan.builtProfile", JSON.stringify(data.profile));
   }
   ```

3. **handleSendMessage 在 body 加 builtProfile**
   ```ts
   const body: Record<string, unknown> = { messages: apiMessages };
   if (isMentorChat) {
     body.mentorId = activeContact.id;
   } else {
     body.persona = { ... };  // 现有默认 persona,作为兜底
     if (builtProfile) body.builtProfile = builtProfile;
   }
   ```

4. **"清除画像"按钮**：放在画像结果卡片右上角
   ```ts
   <button onClick={() => {
     setBuiltProfile(null);
     localStorage.removeItem("refudan.builtProfile");
   }}>清除画像</button>
   ```

### 后端：`apps/site/src/app/api/chat/route.ts`

1. **request body type 扩展**
   ```ts
   body: { messages, mentorId?, persona?, builtProfile? }
   ```

2. **新增 `derivePersonaFromBuiltProfile()` 函数**
   - 输入：builtProfile JSON
   - 输出：`{ name, background, expertise }` 三元组
   - 规则：见下方 "派生映射"

3. **新增 `extractKeyExperiencesFromBuiltProfile()` 函数**
   - 输入：builtProfile JSON
   - 输出：多段中文事实陈述（教育/方向/能力/风格）
   - 给 buildSystemPrompt 的 extraContext 参数用

4. **优先级**（route.ts 已有的逻辑微调）
   ```
   mentorId + consent + token       → SecondMe streamChat (现有)
   mentorId + no consent            → DeepSeek + mentor.persona (现有)
   no mentorId + builtProfile       → DeepSeek + 派生 persona + 派生 extraContext (新增)
   no mentorId + persona            → DeepSeek + persona (现有兜底)
   ```

### 派生映射

**输入** Phase 1/2 真实吐出来的 builtProfile 结构：
```json
{
  "basic_info": {
    "display_name": "Linus Torvalds",
    "bio": "...",
    "platforms": ["github"],
    "platform_profiles": {
      "github": { "github_username", "location", "company", "public_repos", "followers" },
      "xiaohongshu": { "nickname", "bio", "avatar_url", "followers", "liked" }
    }
  },
  "content_topics": [{ "topic", "confidence", "evidence_count" }],
  "inferred_signals": {
    "education": { "school": [], "major": [], "grade_level": [], "certifications": [] },
    "career_domains": { "<domain_id>": { "label", "experiences": [] } },
    "skills_inferred": [],
    "interests": [],
    "industry_signals": []
  },
  "style_profile": {
    "writing_style": [],
    "tone": [],
    "language_complexity": "moderate",
    "avg_post_length": "medium"
  }
}
```

**派生规则**：

```ts
persona.name = basic_info.display_name || "我的 Agent"

persona.background = [
  educationSummary,                              // "复旦计算机大三" 之类
  platformSummary,                               // "GitHub @torvalds / 小红书 @xxxx"
  topTopics(2),                                  // 前 2 个高置信 topic
].filter(Boolean).join("，") || "复旦学生 AI 数字分身"

persona.expertise = [
  skills_inferred.slice(0, 5).join("、"),
  contentTopics.slice(0, 3).map(t => t.topic).join("、"),
].filter(Boolean).join(" | ") || "校园经验与个人成长"
```

```ts
extractKeyExperiencesFromBuiltProfile(profile) -> string:
  parts = []

  if (profile.basic_info?.bio) parts.push(`Bio:${bio}`)

  if (education has data) parts.push(
    `教育背景:${school}, ${major}, ${grade}` +
    (certifications ? `; 证书:${certifications.join("/")}` : "")
  )

  if (career_domains has data) parts.push(
    "职业方向:" + Object.values(career_domains).map(d =>
      `${d.label}(${d.experiences.slice(0,2).join("；")})`
    ).join("；")
  )

  if (content_topics conf >= 0.5) parts.push(
    "关注话题:" + content_topics
      .filter(t => t.confidence >= 0.5)
      .map(t => `${t.topic}(${(t.confidence*100).toFixed(0)}%)`)
      .join("、")
  )

  if (skills_inferred) parts.push("核心能力:" + skills.join("、"))

  if (interests) parts.push("兴趣:" + interests.join("、"))

  if (style_profile.tone) parts.push("表达风格:" + tone.join("、"))

  if (audience_guess.description) parts.push("目标受众:" + audience_guess.description)

  return parts.join("\n")
```

输出示例（用户跑了 GitHub torvalds 后）：
```
Bio:Linux kernel maintainer
教育背景:Helsinki / Computer Science
关注话题:Linux Kernel(95%), Open Source(92%), Version Control(88%)
核心能力:Kernel Development、C Programming、Distributed Systems、OS Design、Performance Optimization
表达风格:直接、技术导向、不绕弯子
```

这段会通过 `buildSystemPrompt(persona, extraContext)` 拼到最终 system prompt 里。

## 验收

1. ✅ 跑完 `github:torvalds` 提取 → 在 Match section 和"我的 Agent"对话 → 问"你最熟悉哪个领域？" → 答案明显聚焦 Linux/内核/Git/开源，而不是空泛"我是 AI 分身"
2. ✅ 跑完 XHS `95544127432` 提取后 → 同样对话 → 答案围绕用户实际发的内容方向
3. ✅ 刷新浏览器 → builtProfile 还在 → 对话仍带个性化
4. ✅ 点"清除画像" → 对话回退到空泛默认人设
5. ✅ Mentor 对话路径不破：选 mentor → SecondMe streamChat（有 token）或 DeepSeek + mentor.persona（无 token）都跑通
6. ✅ TypeScript typecheck 通过

## 不在 Phase 3a 范围

- 让用户编辑 / 微调派生出的 persona（直接重新抓即可）
- 多份画像切换（一次只有 1 份）
- 把对话历史也写进 RAG 上下文
- builtProfile 加密存储 / 与设备绑定
- 学长 vs 学弟分叉 UI

## 风险

| 风险 | 对策 |
|---|---|
| builtProfile 结构未来变 | extractKeyExperiencesFromBuiltProfile 全用 optional chaining + 默认值,任何字段缺失就跳过那段 |
| localStorage 中残留旧画像让用户混淆 | "清除画像"按钮在画像卡片显眼位置;画像卡片标题用 nickname 让用户看清是谁 |
| DeepSeek max_tokens=800 + 长 extraContext = 上下文挤压 | extraContext 单段最长截断到 2000 char,topics/skills/interests 各最多 8 个 |
| Persona 文案产生违和感（如"复旦学生" + GitHub 是个老外） | derivePersonaFromBuiltProfile 不硬塞"复旦学生",只用 basic_info 实际数据 |
