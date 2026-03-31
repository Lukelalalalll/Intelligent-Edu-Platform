# AIInteract 上下文记忆功能 — Bug 报告与解决思路

> 生成日期：2026-04-01

---

## 问题现象

用户反映：AIInteract 中 Coze 无论发多少条消息，**永远只重复第一条 AI 回复（A1）**，而不是对新问题的回答。

---

## Bug 1（致命）：`message/list` 解析返回历史中的旧回答，而非新回答

**位置：** `backend/services/ai_gateway_service.py` → `_chat_v3()` → 消息解析循环

**根本原因：**

Coze v3 的 `/v3/chat/message/list` 接口返回本次 Chat 中**所有**消息，包括我们通过 `additional_messages` 注入进去的历史对话。

当发送第 N 轮对话时，`additional_messages` 包含：

```
[user(Q1), assistant(A1), user(Q2), assistant(A2), ..., user(Qn)]
```

Coze 将注入的 assistant 历史消息（A1、A2…）也以 `type: "answer"` 存储。当 `message/list` 返回后，当前代码：

```python
for msg in messages:
    if msg.get("type") in {"answer", "assistant_answer"} and msg.get("content"):
        return msg.get("content")   # ← 返回列表中第一个 "answer" = A1（旧历史）！
```

**结果：** 从第 2 轮起，永远返回 A1（第一条历史回答），因为它在列表里排最前面。
第 1 轮没有历史，所以表现正常。这完全吻合用户描述的 "重复第一句回复"。

**解决思路：**
- 改为遍历取**最后一个** `type == "answer"` 的消息（按时间排列，最新回答排最后）
- 且同时在 payload 中加 `"auto_save_history": False`，让 Coze 不把注入的历史当作新对话内容存储，减少干扰

**修复后的逻辑（伪代码）：**
```python
# 取最后一条 type=answer 的消息
answer = None
for msg in messages:
    if msg.get("type") in {"answer", "assistant_answer"} and msg.get("content"):
        answer = msg["content"]   # 一直更新 → 最终得到最新回答
if answer:
    return answer
# 兜底：取最后一条 assistant 消息
for msg in reversed(messages):
    if msg.get("role") == "assistant" and msg.get("content"):
        return msg["content"]
```

---

## Bug 2（中等）：`system_memory` 作为独立的 `role: "user"` 消息注入，导致 "连续两条 user 消息"

**位置：** `backend/services/ai_gateway_service.py` → `_chat_v3()`

**问题代码：**
```python
if system_memory:
    additional_msgs.append({"role": "user", "content": system_memory, ...})
# 随后又追加了真正的第一条 user 消息
additional_msgs.append({"role": "user", "content": message, ...})
```

当有 memory 且无历史时，Coze 收到：
```
[user(memory_text), user(Q1)]   ← 两条连续 user 消息
```

Coze v3 `additional_messages` 不支持 `role: "system"`，但连续两条 user 消息会让 Bot 不确定要回答哪个，或产生角色混乱。

**解决思路：**
- 将 `system_memory` 内容**合并到当前用户消息的开头**，而非作为独立消息：
```python
if system_memory:
    message = f"[Student profile: {system_memory}]\n\n{message}"
```
- 或者将其追加为历史的第一条 user 消息（只在 chat_history 为空时）

---

## Bug 3（中等）：`auto_save_history` 默认开启，Coze 会对每次请求保存全量历史

**位置：** `backend/services/ai_gateway_service.py` → `_chat_v3()` → payload 构建

**问题：** Coze v3 默认 `auto_save_history: true`。由于我们已在 `additional_messages` 手动传入完整历史，开启自动保存会导致：
1. message list 接口返回注入的历史消息（加剧 Bug 1 的表现）
2. Coze 在其服务器端保存大量冗余上下文

**解决思路：** 关闭自动保存：
```python
payload = {
    ...,
    "auto_save_history": False,   # 我们自己管理历史，不需要 Coze 存储
}
```

---

## Bug 4（低）：前端 `messages` 过滤逻辑混乱

**位置：** `frontend/src/entries/aiInteractEntry.jsx` → `handleSend`, `handleRegenerate`, `handleEditUserMsg`

**问题代码：**
```javascript
messagesForAPI.filter(m => m.role !== 'system' || messagesForAPI.length < 5)
```

这个条件意思是："保留非 system 消息，或者当总消息数 < 5 时保留所有"。
等效于：**当会话 ≥ 5 条时，过滤掉 system 消息；否则全保留。**

但 system 消息本就被后端 `_compact_chat_history` 过滤掉（只保留 user/assistant），所以这个前端过滤是**冗余且混乱的**。对于<5条消息时多发了一个没有实际作用的 system 消息。

**解决思路：** 直接将 messages 原样发到后端，让后端 `_compact_chat_history` 统一处理：
```javascript
// 删除 .filter(...)，直接传 messagesForAPI
await streamSSE(messagesForAPI, targetId, ...);
```

---

## Bug 5（低）：`ChatInput` 收到 `undefined` 文件上传 props

**位置：** `frontend/src/entries/aiInteractEntry.jsx` → `pageProps`

**问题：** `AIInteract/index.jsx` 将 `attachedFiles, isUploadingFile, fileInputRef, handleFileChange, removeAttachedFile` 从 props 解构并传给 `<ChatInput>`，但 `aiInteractEntry.jsx` 的 `pageProps` 中从未定义这些变量。这些 props 以 `undefined` 传入 `ChatInput`。

**解决思路：** 在 `pageProps` 中加入占位值：
```javascript
const pageProps = {
    ...
    attachedFiles: [],
    isUploadingFile: false,
    fileInputRef: null,
    handleFileChange: () => {},
    removeAttachedFile: () => {},
};
```
或者后续补全文件上传功能。

---

## 修复优先级汇总

| # | 严重程度 | 位置 | 问题描述 | 影响 |
|---|---------|------|---------|------|
| 1 | 🔴 致命 | `ai_gateway_service.py` | 取第一条 answer 而非最后一条 | 第 2 轮起永远重复 A1 |
| 2 | 🟠 中等 | `ai_gateway_service.py` | system_memory 作为独立 user 消息 | 连续 user 消息混淆 Coze |
| 3 | 🟠 中等 | `ai_gateway_service.py` | auto_save_history 默认开启 | 加剧 Bug 1，冗余存储 |
| 4 | 🟡 低 | `aiInteractEntry.jsx` | 前端 messages 过滤逻辑 | 冗余/混乱，无实际危害 |
| 5 | 🟡 低 | `aiInteractEntry.jsx` | 文件上传 props 缺失 | ChatInput 收到 undefined |

---

## 最小可行修复（立即可做）

只需修改 `ai_gateway_service.py` 中的两处：

1. **payload 加 `auto_save_history: False`**
2. **消息解析改为取最后一个 answer**
3. **`system_memory` 合并进当前用户消息**

这三项修改可以解决 "重复第一条回复" 的核心问题。
