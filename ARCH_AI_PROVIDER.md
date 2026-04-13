# AI Provider Layer — Detailed Architecture

---

## Overview

The AI Provider layer is a **unified abstraction** that routes LLM requests to either Coze (cloud) or Ollama (local). All features — RAG, Chat Assistant, Video Script, Grading, Slide generation — call a single `AIGatewayService`, which handles provider selection, streaming SSE output, error fallback, and prompt injection.

---

## 1. Provider Selection Architecture

```
  Feature code (RAG, Grading, Chat, Video, etc.)
          │
          │  ai_provider.resolve_provider(task)
          ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  core/ai_provider.py  →  resolve_provider()                          │
  │                                                                      │
  │  Reads from config:                                                  │
  │  ┌─────────────────────────────────────────────────────┐            │
  │  │  AI_PROVIDER = "coze" | "ollama" | "auto"           │            │
  │  │  COZE_API_KEY = "..."                               │            │
  │  │  COZE_BOT_ID  = "..."                               │            │
  │  │  OLLAMA_HOST  = "http://localhost:11434"             │            │
  │  │  OLLAMA_MODEL = "llama3.2-vision:11b"               │            │
  │  └─────────────────────────────────────────────────────┘            │
  │                                                                      │
  │  "coze"   → return AIGatewayService (Coze API)                       │
  │  "ollama" → return LocalLLMService  (Ollama)                         │
  │  "auto"   → try Coze ping, if fails → LocalLLMService                │
  └──────────────────────────────────────────────────────────────────────┘
          │
          ▼
  ┌─────────────────────────┐    ┌─────────────────────────────────────┐
  │  AIGatewayService        │    │  LocalLLMService                    │
  │  (Coze cloud API)        │    │  (Ollama local server)              │
  │                         │    │                                     │
  │  services/               │    │  services/                         │
  │    ai_gateway_service.py │    │    local_llm_service.py             │
  └─────────────────────────┘    └─────────────────────────────────────┘
```

---

## 2. AIGatewayService — Coze API Integration

```
  services/ai_gateway_service.py

  ┌─────────────────────────────────────────────────────────────────────┐
  │  Endpoint:  https://api.coze.com/v3/chat                            │
  │  Auth:      Authorization: Bearer {COZE_API_KEY}                    │
  │  Method:    Bot-based (pre-configured on Coze platform)             │
  └─────────────────────────────────────────────────────────────────────┘

  NON-STREAMING call (for grading, script generation, etc.)
  ─────────────────────────────────────────────────────────────────────
  POST /v3/chat
  Body: {
    bot_id: "...",
    user_id: str(user_id),
    stream: false,
    additional_messages: [
      { role: "user", content: prompt, content_type: "text" }
    ]
  }

  Response: { data: { id: conversationId } }
            ↓ poll
  GET /v3/chat/retrieve?conversation_id=...&chat_id=...
            ↓ wait for status == "completed"
  GET /v3/chat/messages/list?conversation_id=...&chat_id=...
            ↓ find assistant message with type="answer"
  → return message content

  Polling strategy:
    max_polls  = 30
    poll_delay = 2 seconds
    total max  = 60 seconds before timeout

  ─────────────────────────────────────────────────────────────────────
  STREAMING call (for chat assistant, RAG responses)
  ─────────────────────────────────────────────────────────────────────
  POST /v3/chat  with  stream: true

  Response: Server-Sent Events stream
  Backend reads SSE chunks using safe_requests.py streaming fetch:

    for line in response.iter_lines():
      if line == "data: [DONE]": break
      event = json.loads(line[6:])  ← strip "data: " prefix

      if event.type == "conversation.message.delta":
        yield SSE chunk with delta content

  ─────────────────────────────────────────────────────────────────────
  Error handling in AIGatewayService:
  ─────────────────────────────────────────────────────────────────────
  4xx / 5xx HTTP → raise AIProviderError(code, message)
  Caller can catch and retry with LocalLLMService as fallback
```

---

## 3. LocalLLMService — Ollama Integration

```
  services/local_llm_service.py

  ┌────────────────────────────────────────────────────────────────────┐
  │  Endpoint:  http://localhost:11434/api/chat                         │
  │  Auth:      none (local only)                                      │
  │  Protocol:  Ollama REST API (OpenAI-compatible messages format)     │
  └────────────────────────────────────────────────────────────────────┘

  Task Profiles:
  ┌──────────────────┬────────────────────────────────────────────────┐
  │  Profile          │  Settings                                      │
  ├──────────────────┼────────────────────────────────────────────────┤
  │  light            │  model: llama3.2-vision:11b                    │
  │  (chat, summaries)│  temperature: 0.7, top_p: 0.9                  │
  │                  │  num_predict: 512                               │
  ├──────────────────┼────────────────────────────────────────────────┤
  │  heavy            │  model: llama3.2-vision:11b                    │
  │  (grading, RAG)   │  temperature: 0.3, top_p: 0.95                 │
  │                  │  num_predict: 2048                              │
  └──────────────────┴────────────────────────────────────────────────┘

  Vision support (multimodal):
  ┌────────────────────────────────────────────────────────────────────┐
  │  If images are passed:                                             │
  │  messages: [                                                       │
  │    { role: "user",                                                 │
  │      content: prompt_text,                                         │
  │      images: [base64_encoded_image_1, ...]  ← Ollama vision format │
  │    }                                                               │
  │  ]                                                                 │
  │  Used by: image_extractor_routes.py (OCR, diagram analysis)        │
  └────────────────────────────────────────────────────────────────────┘

  Streaming:
  POST /api/chat  with  "stream": true
  Response: NDJSON (newline-delimited JSON)
  Each line: { "message": { "content": "..." }, "done": bool }
  Backend yields each content chunk as SSE delta
```

---

## 4. Unified SSE Streaming Format

```
  All streaming AI responses to the browser use the same SSE format:

  ┌──────────────────────────────────────────────────────────────────────┐
  │  (FastAPI StreamingResponse, media_type="text/event-stream")         │
  │                                                                      │
  │  data: {"type": "sse_delta", "content": "Here is your"}             │
  │                                                                      │
  │  data: {"type": "sse_delta", "content": " answer about"}            │
  │                                                                      │
  │  data: {"type": "sse_delta", "content": " the topic..."}            │
  │                                                                      │
  │  data: {"type": "sse_meta",  "sources": [...], "tokens": 245}       │
  │                ↑ optional metadata (RAG sources, token count)        │
  │                                                                      │
  │  data: [SSE_DONE]                                                   │
  │  ↑ sentinel string closes the frontend EventSource reader            │
  └──────────────────────────────────────────────────────────────────────┘

  Frontend reading pattern (services/aiService.ts):
  ┌──────────────────────────────────────────────────────────────────────┐
  │  const reader = response.body.getReader()                            │
  │  const decoder = new TextDecoder()                                   │
  │                                                                      │
  │  while (true) {                                                      │
  │    const { value, done } = await reader.read()                       │
  │    if (done) break                                                   │
  │    const text = decoder.decode(value)                                │
  │    for (const line of text.split('\n')) {                            │
  │      if (!line.startsWith('data: ')) continue                        │
  │      const payload = line.slice(6)                                   │
  │      if (payload === '[SSE_DONE]') { reader.cancel(); break }        │
  │      const { type, content } = JSON.parse(payload)                   │
  │      if (type === 'sse_delta') appendChar(content)                   │
  │    }                                                                 │
  │  }                                                                   │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## 5. Prompt Injection System

```
  YAML-based prompt templates with variable substitution:

  backend/prompts/
  ├── chat_assistant.yaml    ← for AI chat assistant (AIInteract)
  ├── grading.yaml           ← for assignment grading pipeline
  └── email.yaml             ← for email drafting feature

  Example: chat_assistant.yaml
  ┌──────────────────────────────────────────────────────────────────────┐
  │  system: |                                                           │
  │    You are an AI educational assistant for {course_name}.            │
  │    Student level: {level}. Language: {language}.                     │
  │    Always be encouraging and pedagogically sound.                    │
  │                                                                      │
  │  user_prefix: |                                                      │
  │    Context from course materials:                                    │
  │    {rag_context}                                                     │
  │                                                                      │
  │    Student question:                                                 │
  └──────────────────────────────────────────────────────────────────────┘

  Usage in service:
  prompt_loader.load("chat_assistant", {
    "course_name": course.name,
    "level": "undergraduate",
    "language": "English",
    "rag_context": retrieved_passages
  })
```

---

## 6. Provider Health Check & Admin Dashboard

```
  GET /api/admin/ai-providers/health

  ┌──────────────────────────────────────────────────────────────────────┐
  │  Checks both providers:                                              │
  │                                                                      │
  │  Coze:   GET https://api.coze.com/v3/bots/{botId}                    │
  │          → { status: "ok" | "error", latencyMs }                     │
  │                                                                      │
  │  Ollama: GET http://localhost:11434/api/tags                         │
  │          → lists available models                                    │
  │          → { status: "ok" | "error", models: [...], latencyMs }     │
  │                                                                      │
  │  Response:                                                           │
  │  {                                                                   │
  │    "coze":   { "status": "ok",   "latencyMs": 243  },               │
  │    "ollama": { "status": "ok",   "latencyMs": 12,                    │
  │                "models": ["llama3.2-vision:11b"] }                   │
  │  }                                                                   │
  └──────────────────────────────────────────────────────────────────────┘

  Admin LLM Monitor page (/admin/llm-monitor):
  - Shows real-time token usage per feature
  - Response time histogram
  - Provider uptime / error rate
  - Data sourced from:
    infrastructure/telemetry.py → MongoDB collection: llm_usage_logs
```

---

## 7. Telemetry and Usage Logging

```
  infrastructure/telemetry.py + rag_telemetry.py

  Every LLM call logs:
  ┌──────────────────────────────────────────────────────────────────────┐
  │  db.llm_usage_logs:                                                  │
  │  {                                                                   │
  │    provider:    "coze" | "ollama",                                   │
  │    feature:     "rag" | "chat" | "grading" | "video" | "email",      │
  │    userId:      string,                                              │
  │    promptTokens:  number,                                            │
  │    outputTokens:  number,                                            │
  │    latencyMs:     number,                                            │
  │    success:       bool,                                              │
  │    errorCode:     string | null,                                     │
  │    timestamp:     ISO string                                         │
  │  }                                                                   │
  └──────────────────────────────────────────────────────────────────────┘

  RAG-specific telemetry (rag_telemetry.py):
  ┌──────────────────────────────────────────────────────────────────────┐
  │  db.rag_retrieval_logs:                                              │
  │  {                                                                   │
  │    courseId:        string,                                          │
  │    query:           string,                                          │
  │    queryRewritten:  string,                                          │
  │    chromaHits:      number,                                          │
  │    tfidfHits:       number,                                          │
  │    rrfTopK:         number,                                          │
  │    answerTokens:    number,                                          │
  │    latencyMs:       number,                                          │
  │    timestamp:       ISO string                                       │
  │  }                                                                   │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## 8. Feature → Provider Mapping

```
  ┌──────────────────────────────────┬─────────────────────┬────────────┐
  │  Feature                          │  Preferred Provider  │  Fallback  │
  ├──────────────────────────────────┼─────────────────────┼────────────┤
  │  RAG course assistant             │  Coze (streaming)   │  Ollama    │
  │  Chat AI summarise/suggest        │  Coze (streaming)   │  Ollama    │
  │  Grading pipeline                 │  Coze (non-stream)  │  Ollama    │
  │  Video script generation          │  Coze (non-stream)  │  Ollama    │
  │  Slide content generation         │  Coze (non-stream)  │  Ollama    │
  │  Email drafting                   │  Coze (streaming)   │  Ollama    │
  │  Image / diagram analysis (OCR)   │  Ollama ONLY        │  none      │
  │  Study notes generation           │  Coze (streaming)   │  Ollama    │
  └──────────────────────────────────┴─────────────────────┴────────────┘

  Note: image/vision tasks always use Ollama (llama3.2-vision:11b)
  because Coze does not expose raw vision endpoints in the current
  bot configuration.
```

---

*Generated: 2026-04-12*
