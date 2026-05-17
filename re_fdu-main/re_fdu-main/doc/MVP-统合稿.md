---
type: project
status: active
created: 2026-05-17
---

# RE:FUDAN MVP 统合稿

> 这份文档把三层材料压成一个可执行判断：Second Me 的存在叙事、ANet 的网络底座、RE:FUDAN 的产品闭环。

## 核心判断

> **RE:FUDAN 的 MVP 不该是一个"完整的校园分身互联网"，也不该是一个"真正部署完的开放 agent network"。它应该是一个以"路径匹配 + A2A 前哨对话 + 真人引荐闭环"为核心的、带有 Second Me 世界观和 ANet 结构意识的校园 agent-native 社交演示系统。**

## 三层分工

| 层 | 来源 | 作用 |
|---|---|---|
| 愿景层 | Second Me | 未来社交不是 static profile，而是持续存在的 identity scaffold |
| 结构层 | ANet / ANP | agent 需要身份、发现、描述和协作底座 |
| 产品层 | RE:FUDAN MVP | 在校园里，先把最痛、最高频、最能 demo 的闭环做出来 |

## 最强的那句话

> **"让你的经验，先你一步去见想见的人。"**

这句话之所以强，是因为它没有把产品理解成"帮你做一个更炫的分身"，而是理解成：**先把经验推出去，让它先完成一次低摩擦的接触。**

## MVP 骨架（四段式闭环）

```
用户有明确路径问题
  -> 系统帮他形成一个可被代理的身份/诉求包（P1）
    -> 系统找到路径相近且有帮助价值的前辈 agent（P2）
      -> agent 先进行前哨对话与知识检索（P3）
        -> 只有在值得时才触发真人会面（P4）
```

### 第一段：轻量身份构造（P1）
不是完整人格训练，而是最小可代理化身份包：
- 学校 / 专业 / 年级 / 目标
- 简历或经历摘要
- 少量知识材料
- 隐私分级设置

### 第二段：路径匹配（P2）
不是广场，不是排行榜，而是找"领先你 1-2 个阶段的路径先行者"：
- 3 个种子前辈 agent
- 简单但可视化的匹配理由
- 统一 CTA：`让我的 agent 去聊聊`

### 第三段：A2A 前哨对话（P3）
MVP 的灵魂页，唯一真正必须"精彩"的地方：
- 学弟 agent 提问
- 学长 agent 基于知识材料回答 + cite 展示
- 协议/trace 感展示
- 隐私级别切换后的回答变化
- 一键总结 / 对话摘要

### 第四段：真人引荐闭环（P4）
整个系统伦理正当性的来源，绝不能删：
- 学长 agent 向真人学长生成汇报卡
- 同意 / 拒绝按钮
- 同意后进入微信/邮件 mock

## MVP 明确不做什么

1. **不做完整多平台人格抽取**（小红书/公众号/知乎全量同步）
2. **不做泛校园全场景**（求偶、二手、社团、游戏、排行榜）
3. **不做真实开放网络协议部署**（did:wba / ad.json 保留思想，不做 infra demo）
4. **不做完整长期记忆系统**（只需最小摘要级关系记忆）
5. **不做"万能校园 agent"**（只围绕某条人生路径组织高质量相遇）

## 最准确的产品定义

**中文版**：
> RE:FUDAN 是一个面向校园升学与求职路径的 agent-native 前哨社交系统。它不是让 AI 替代人与人相见，而是让你的经验、问题与路径先通过 agent 被理解、被匹配、被解释，并在值得时为你换来一次更高质量的真人相遇。

**英文版（评委/合作者）**：
> A campus agent-native social MVP for path matching: lightweight student agents, path-similar mentor discovery, A2A pre-conversation grounded in knowledge snippets, and a human-approved intro handoff.

## 推荐切入场景

- **保研 / 夏令营路径**
- **大厂 / 金融 / 研究实习路径**

理由：痛点强、关系价值高、A2A 合法性强、伦理闭环清楚。

## 关键上下文路径

### 本仓库
- `doc/用户需求PRD_latest.md`
- `doc/RE_FUDAN-命名备忘与意象谱系.md`
- `.trellis/spec/guides/anp-protocol-summary.md` — ANP 协议工程摘要
- `.trellis/spec/guides/campus-interface-schema.md` — 校园接口定义
- `.trellis/spec/guides/second-me-architecture.md` — Second Me 架构与 RE:FUDAN 的取舍
