# Frontend Architecture — Detailed Reference

---

## Overview

The frontend is a **React 18 + TypeScript + Vite 5** single-page application. It is organized into **feature modules** under `src/features/`, with shared infrastructure in `src/components/`, `src/store/`, and `src/services/`. State is managed with **Zustand** (selector-based subscriptions), routing with **React Router v7**, and HTTP with **Axios** (auto cookie handling).

---

## 1. Directory Structure

```
  frontend/src/
  ├── App.tsx                   ← root router, lazy-loaded routes
  ├── main.tsx                  ← ReactDOM.createRoot entry
  │
  ├── features/                 ← all feature modules (isolated)
  │   ├── auth/                 ← login, register, OAuth callback
  │   ├── chat/                 ← IM chat: rooms, messages, contacts
  │   ├── courses/              ← course list, enrollment, detail page
  │   ├── ai/                   ← AI Interact (chat assistant + RAG)
  │   ├── grading/              ← student assignments, teacher grader
  │   ├── slides/               ← AI slide deck generator
  │   ├── video/                ← AI video generator
  │   ├── study-notes/          ← AI study note generator
  │   ├── email/                ← AI email composer
  │   ├── homework/             ← homework submission + view
  │   ├── questions/            ← question bank management
  │   ├── admin/                ← user management, LLM monitor
  │   └── profile/              ← user settings, avatar
  │
  ├── components/               ← shared UI components
  │   ├── Layout.tsx            ← main shell: navbar, sidebar, websocket
  │   ├── Sidebar.tsx           ← left nav + unread badge
  │   ├── ProtectedRoute.tsx    ← JWT-gated routes
  │   └── ui/                   ← Button, Modal, Toast, Spinner, etc.
  │
  ├── store/                    ← Zustand stores
  │   ├── authStore.ts          ← user, isLoggedIn, login(), logout()
  │   └── (feature stores in each feature folder)
  │
  ├── services/                 ← Axios API clients
  │   ├── axiosClient.ts        ← base Axios instance (withCredentials)
  │   ├── authApi.ts            ← login, register, refresh, OAuth
  │   └── (feature APIs in each feature folder)
  │
  └── types/                    ← shared TypeScript interfaces
      └── index.ts
```

---

## 2. Routing Structure

```
  App.tsx — React Router v7 createBrowserRouter

  /                      → redirect to /courses (if logged in)
  /login                 → AuthPage (login / register tabs)
  /oauth/callback        → OAuthCallbackPage (Google OAuth)
  /                      ← ProtectedRoute wrapper (requires auth)
  │
  ├── /courses           → CoursesPage
  │   └── /courses/:id  → CourseDetailPage
  │
  ├── /ai                → AIInteractPage  (course RAG assistant)
  │
  ├── /chat              → ChatPage (IM)
  │   └── /chat/room/:roomId → ChatPage with active room
  │
  ├── /grading           → GradingPage (student view)
  │   └── /grading/:courseId → GradingWorkbench (teacher view)
  │
  ├── /slides            → SlidesPage
  ├── /video             → VideoGenPage
  ├── /study-notes       → StudyNotesPage
  ├── /email             → EmailPage
  ├── /homework          → HomeworkPage
  ├── /questions         → QuestionsPage
  ├── /profile           → ProfilePage
  │
  └── /admin             ← AdminRoute (requires role=admin)
      ├── /admin/users   → AdminUsersPage
      └── /admin/llm-monitor → LLMMonitorPage
```

---

## 3. Zustand State Management Pattern

```
  CORRECT pattern (reactivity-safe):

  ┌────────────────────────────────────────────────────────────────┐
  │  // Subscribe to specific slice → re-renders only when value   │
  │  // of that slice changes                                      │
  │  const unreadCount = useChatStore(s => s.unreadCounts[id] ?? 0)│
  │  const rooms       = useChatStore(s => s.rooms)               │
  │  const user        = useAuthStore(s => s.user)                │
  └────────────────────────────────────────────────────────────────┘

  AVOID (full-state destructuring):

  ┌────────────────────────────────────────────────────────────────┐
  │  // This pattern can miss re-renders when nested objects change │
  │  const { unreadCounts, rooms } = useChatStore()               │
  └────────────────────────────────────────────────────────────────┘

  chatStore.ts slices:
  ┌──────────────────────────────────────────────────────────────────────┐
  │  rooms:        ChatRoom[]          ← all joined rooms                │
  │  messages:     Record<roomId, ChatMessage[]>  ← messages per room   │
  │  unreadCounts: Record<roomId, number>         ← unread per room     │
  │  activeRoomId: string | null                                         │
  │                                                                      │
  │  Actions:                                                            │
  │  setRooms, appendRoom, updateRoom, removeRoom                        │
  │  setMessages, appendMessage, replaceOptimisticMessage                │
  │  updateRoomLastMessage                                               │
  │  incrementUnread, clearUnread, setUnreadCounts                       │
  └──────────────────────────────────────────────────────────────────────┘

  authStore.ts slices:
  ┌──────────────────────────────────────────────────────────────────────┐
  │  user:       User | null                                             │
  │  isLoggedIn: bool                                                    │
  │  role:       "student" | "teacher" | "admin"                        │
  │                                                                      │
  │  Actions:  login(user), logout(), setUser(u)                         │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## 4. HTTP Client Architecture

```
  services/axiosClient.ts

  ┌────────────────────────────────────────────────────────────────────┐
  │  const client = axios.create({                                     │
  │    baseURL: import.meta.env.VITE_API_URL,  ← from .env            │
  │    withCredentials: true                   ← sends HttpOnly cookies │
  │  })                                                                │
  │                                                                    │
  │  Request interceptor:                                              │
  │  - reads XSRF token from cookie                                    │
  │  - adds X-XSRF-Token header                                        │
  │                                                                    │
  │  Response interceptor:                                             │
  │  - 401 Unauthorized → call authApi.refresh()                       │
  │    → if refresh succeeds: retry original request once             │
  │    → if refresh fails: authStore.logout() → redirect /login        │
  │  - 403 Forbidden → redirect to /forbidden                          │
  └────────────────────────────────────────────────────────────────────┘

  All feature API files import this client:
  import client from 'services/axiosClient'
```

---

## 5. WebSocket Lifecycle in Layout.tsx

```
  Layout.tsx mounts once (persists across route changes)

  ┌──────────────────────────────────────────────────────────────────────┐
  │  const isLoggedIn = useAuthStore(s => s.isLoggedIn)                  │
  │                                                                      │
  │  // Seeds room list + unread counts on app load                      │
  │  useChatRooms(isLoggedIn)                                            │
  │                                                                      │
  │  // Maintains persistent WS connection                               │
  │  useChatWebSocket(isLoggedIn)                                        │
  └──────────────────────────────────────────────────────────────────────┘

  Why in Layout:
  - Single WebSocket for entire app lifetime
  - Messages received even when user is on a different page
  - Unread counts accumulate while browsing other features

  Teardown:
  - useEffect cleanup: ws.close()
  - Called on logout or tab close
```

---

## 6. CSS Architecture

```
  Pattern: CSS Modules + global variables

  Each component:
  ┌──────────────────────────────────────────────────────────────────┐
  │  Component.tsx        imports styles from './Component.module.css'│
  │  Component.module.css  uses locally-scoped class names           │
  └──────────────────────────────────────────────────────────────────┘

  Global theme variables (src/index.css):
  ┌──────────────────────────────────────────────────────────────────┐
  │  :root {                                                         │
  │    --color-primary:    #4f46e5;   (indigo)                       │
  │    --color-bg:         #0f1117;   (dark background)              │
  │    --color-surface:    #1a1d2e;   (card / panel)                 │
  │    --color-border:     #2a2d3e;                                  │
  │    --color-text:       #e2e8f0;                                  │
  │    --color-muted:      #64748b;                                  │
  │    --radius-md:        8px;                                      │
  │    --shadow-md:        0 4px 12px rgba(0,0,0,0.3);               │
  │  }                                                               │
  └──────────────────────────────────────────────────────────────────┘

  Animation library: Framer Motion
  - Page transitions (AnimatePresence + motion.div)
  - Sidebar slide-in
  - Modal open/close
  - Message appear animations
```

---

## 7. SSE Streaming Pattern (AI Features)

```
  Multiple AI features (RAG, Study Notes, Slides, Email, Video)
  read streamed AI responses:

  ┌──────────────────────────────────────────────────────────────────────┐
  │  // NOT using EventSource — using fetch() for POST support           │
  │                                                                      │
  │  const response = await fetch('/api/ai/chat', {                      │
  │    method: 'POST',                                                   │
  │    credentials: 'include',                                           │
  │    body: JSON.stringify({ query, courseId })                         │
  │  })                                                                  │
  │                                                                      │
  │  const reader = response.body!.getReader()                           │
  │  const decoder = new TextDecoder()                                   │
  │                                                                      │
  │  while (true) {                                                      │
  │    const { value, done } = await reader.read()                       │
  │    if (done) break                                                   │
  │                                                                      │
  │    const lines = decoder.decode(value).split('\n')                   │
  │    for (const line of lines) {                                       │
  │      if (!line.startsWith('data: ')) continue                        │
  │      if (line === 'data: [SSE_DONE]') return                         │
  │      const { type, content } = JSON.parse(line.slice(6))             │
  │      if (type === 'sse_delta') setOutput(prev => prev + content)     │
  │    }                                                                 │
  │  }                                                                   │
  └──────────────────────────────────────────────────────────────────────┘

  Typewriter effect:
  Characters are appended one at a time via setState
  → creates natural "typing" animation as tokens stream in
  → no explicit delay needed — LLM token rate provides natural cadence
```

---

## 8. Authentication Flow

```
  Standard login:
  ─────────────────────────────────────────────────────────────────
  POST /api/auth/login { email, password }
    ← sets HttpOnly cookie: access_token (15 min)
    ← sets HttpOnly cookie: refresh_token (7 days)
    ← returns { user } in body
  authStore.login(user) → isLoggedIn = true → redirect /courses

  Google OAuth:
  ─────────────────────────────────────────────────────────────────
  GET /api/auth/google/init
    ← redirects to Google OAuth consent page
  Google redirects back to:
  /oauth/callback?code=...&state=...
  Frontend calls: POST /api/auth/google/callback { code, state }
    ← same cookie response as standard login

  Token Refresh:
  ─────────────────────────────────────────────────────────────────
  On 401 response (Axios interceptor):
  POST /api/auth/refresh
    ← uses refresh_token cookie
    ← issues new access_token cookie
  → original request retried automatically

  Logout:
  ─────────────────────────────────────────────────────────────────
  POST /api/auth/logout
    ← server clears both cookies (Max-Age=0)
  authStore.logout() → redirect /login
```

---

## 9. Build & Environment

```
  Build tool: Vite 5

  Environment files:
  .env                → VITE_API_URL=http://localhost:8000
  .env.production     → VITE_API_URL=https://api.yourdomain.com

  Build output: dist/  (served by nginx in production)

  Key npm scripts:
  ┌──────────────────────────────────────────────────────────────┐
  │  npm run dev       → Vite dev server :5173, HMR enabled      │
  │  npm run build     → TypeScript check + Vite bundle          │
  │  npm run preview   → preview production build locally        │
  │  npm run test      → Vitest unit tests                       │
  │  npm run lint      → ESLint check                            │
  └──────────────────────────────────────────────────────────────┘

  Test framework: Vitest + @testing-library/react
  Config: vitest.config.ts
```

---

*Generated: 2026-04-12*
