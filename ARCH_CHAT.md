# Real-time Chat (IM) — Detailed Architecture

---

## Overview

The Chat system is a full instant-messaging (IM) platform built with **FastAPI WebSockets** on the backend and a **Zustand** state store on the frontend. It supports direct messages, group rooms, course-linked groups, real-time unread badges, message recall, typing indicators, read receipts, and in-chat AI assistance.

---

## 1. System Architecture Overview

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                         BROWSER (React 18)                              │
  │                                                                         │
  │  shared/Layout.tsx                                                      │
  │  ├── useChatWebSocket(enabled)   ← ONE global WS connection per tab    │
  │  └── useChatRooms(enabled)       ← seeds rooms + unread counts on load  │
  │                                                                         │
  │  features/chat/                                                         │
  │  ├── pages/ChatPage.tsx          ← /chat/room/:roomId                  │
  │  ├── components/                                                        │
  │  │   ├── ContactList.tsx         ← left pane: room list + search        │
  │  │   ├── ContactItem.tsx         ← per-room card with live unread badge │
  │  │   └── ChatWindow.tsx          ← message area, send bar, receipts     │
  │  └── store/chatStore.ts          ← Zustand: all chat state              │
  │                                                                         │
  │  WebSocket ◄──────────────────────────────────────────────► REST HTTP  │
  └──────────────────────────┬──────────────────────────────────────────────┘
                             │  ws://host/api/chat/ws   +   /api/chat/*
                             ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                   BACKEND (FastAPI + Python 3.11)                       │
  │                                                                         │
  │  routes/chat_routes/                                                    │
  │  ├── ws.py             ← WebSocket endpoint, JWT auth, message loop     │
  │  ├── rooms.py          ← GET/POST rooms, unread count aggregation       │
  │  ├── messages.py       ← GET messages, mark-read, delete, recall        │
  │  ├── contacts.py       ← friend search, add, accept, reject             │
  │  ├── ai_actions.py     ← in-chat AI: summarise, suggest, rewrite        │
  │  └── router.py         ← ConnectionManager, broadcast helpers           │
  │                                                                         │
  └──────────────────────────┬──────────────────────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    MongoDB       │
                    │ chat_messages   │
                    │ chat_rooms      │
                    │ friend_requests │
                    └─────────────────┘
```

---

## 2. WebSocket Connection Lifecycle

```
  Browser opens /chat page
          │
          │  Layout.tsx: useChatWebSocket(true)
          ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  connect() is called                                         │
  │                                                              │
  │  new WebSocket("ws://host/api/chat/ws")                      │
  └──────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Backend: routes/chat_routes/ws.py                           │
  │                                                              │
  │  1. Read JWT from HttpOnly cookie                            │
  │  2. Validate token (python-jose)                             │
  │  3. Look up user in MongoDB                                  │
  │  4. If invalid → ws.close(code=4001, "Unauthorized")         │
  │  5. If valid   → manager.connect(uid, ws)                    │
  └──────────────────────────┬───────────────────────────────────┘
                             │
                             ▼
  ┌───────────────────────────────────────────────┐
  │  ConnectionManager._connections[uid] = ws      │
  │  (Dict[user_id → WebSocket])                   │
  │                                               │
  │  If user already connected (refresh/tab):     │
  │  → old WS is closed, new one replaces it      │
  └───────────────────────────────────────────────┘
                             │
                             │  ws.onopen fires in frontend
                             ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Frontend reconnect handler (if reconnectCount > 0)          │
  │                                                              │
  │  chatApi.getRooms() → setRooms(rooms)                        │
  │                     → setUnreadCounts(counts)                │
  │  chatApi.getMessages(activeRoomId) → setMessages(...)        │
  └──────────────────────────────────────────────────────────────┘

  ── Disconnect / Reconnect ─────────────────────────────────────────
  ws.onclose fires (network drop / server restart / tab switch)
          │
          │  exponential backoff:
          │  delay = min(1000ms × 2^reconnectCount, 30000ms)
          │  reconnectCount++ on each attempt
          ▼
  setTimeout(connect, delay)   ← retry automatically forever

  Visibility API: document.visibilityChange → 'visible'
          │
          │  if ws not OPEN → immediately call connect()
          ▼
  Fast reconnect when user returns to tab
```

---

## 3. Message Send / Receive Flow

```
  ═══════════════════════════════════════════════════════
  SENDING  (User types and sends a message)
  ═══════════════════════════════════════════════════════

  User types in ChatWindow input
          │
          │  "Send" pressed
          ▼
  ┌────────────────────────────────────────┐
  │  Optimistic UI update                   │
  │                                        │
  │  localId = crypto.randomUUID()          │
  │  optimisticMsg = {                     │
  │    id: localId,                        │
  │    content, senderId, sentAt,          │
  │    status: "sending"                   │
  │  }                                     │
  │  store.appendMessage(roomId, optimisticMsg) │
  │  (message appears immediately in UI)   │
  └─────────────────┬──────────────────────┘
                    │
                    │  wsSend({ type: "new_message",
                    │           roomId, content, localId })
                    ▼
  ┌────────────────────────────────────────────────────────────┐
  │  Backend ws.py — receives "new_message" event              │
  │                                                            │
  │  1. Verify sender is member of room                        │
  │  2. Look up optional replyTo message                       │
  │  3. Build msg_doc:                                         │
  │     { roomId, senderId, senderName, content,               │
  │       type, recalled:false, readBy:[uid],                  │
  │       deletedFor:[], sentAt: utcnow() }                    │
  │  4. db.chat_messages.insert_one(msg_doc)                   │
  │  5. db.chat_rooms.update_one ← set lastMessage             │
  │  6. broadcast_to_room(members, new_message, exclude=uid)   │
  │  7. send_to_user(uid, message_ack)                         │
  └────────────────────────────────────────────────────────────┘
                    │
          ┌─────────┴──────────────────────────────┐
          │                                        │
          ▼                                        ▼
  message_ack → sender                  new_message → all other members
          │                                        │
          ▼                                        ▼
  replaceOptimisticMessage(localId, real_msg)   appendMessage(roomId, msg)
  (replaces placeholder with server message)   updateRoomLastMessage()
                                               if not viewing room:
                                                 incrementUnread(roomId)

  ═══════════════════════════════════════════════════════
  RECEIVING  (Someone else sends a message)
  ═══════════════════════════════════════════════════════

  ws.onmessage fires with type="new_message"
          │
          ▼
  ┌────────────────────────────────────────────────────────────────────┐
  │  useChatWebSocket.ts — new_message handler                         │
  │                                                                    │
  │  appendMessage(msg.roomId, msg)      ← add to message list         │
  │  updateRoomLastMessage(msg.roomId)   ← update room preview text    │
  │                                                                    │
  │  isViewingRoom = isChatRoute                                       │
  │               && activeRoomId === msg.roomId                       │
  │                                                                    │
  │  if (!isViewingRoom && msg.senderId !== myId):                     │
  │    incrementUnread(msg.roomId)       ← +1 to unread counter        │
  └────────────────────────────────────────────────────────────────────┘
          │
          │  Zustand store update triggers re-render
          ▼
  ┌─────────────────────────────────────────────────────┐
  │  ContactItem.tsx                                    │
  │                                                     │
  │  const unreadCount =                                │
  │    useChatStore(s => s.unreadCounts[room.id] ?? 0) │
  │                          ← selector subscription   │
  │                          ← re-renders THIS ITEM only│
  │                                                     │
  │  Shows red badge:  [ 3 ]                            │
  └─────────────────────────────────────────────────────┘
          │
          │  Sidebar Layout.tsx also re-renders:
          ▼
  ┌─────────────────────────────────────────────────────┐
  │  totalUnread =                                      │
  │    useChatStore(s =>                                │
  │      Object.values(s.unreadCounts)                  │
  │        .reduce((sum, n) => sum + n, 0))             │
  │                                                     │
  │  Shows badge on sidebar "Chat" icon: [ 7 ]          │
  └─────────────────────────────────────────────────────┘
```

---

## 4. All WebSocket Event Types

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  CLIENT → SERVER (browser sends)                                     │
  ├───────────────────┬──────────────────────────────────────────────────┤
  │  type             │  payload                                         │
  ├───────────────────┼──────────────────────────────────────────────────┤
  │  new_message      │  { roomId, content, localId, replyTo? }          │
  │  typing           │  { roomId }                                      │
  │  read_receipt     │  { roomId }  (marks all messages as read)        │
  └───────────────────┴──────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────┐
  │  SERVER → CLIENT (backend broadcasts/sends)                          │
  ├───────────────────┬────────────────────────────────────────────────── │
  │  type             │  who receives       │  payload                   │
  ├───────────────────┼─────────────────────┼───────────────────────────  │
  │  new_message      │  all room members   │  { message: {...} }        │
  │                   │  (except sender)    │                            │
  │  message_ack      │  sender only        │  { localId, message }      │
  │  message_recalled │  all room members   │  { roomId, messageId }     │
  │  typing           │  all room members   │  { roomId, userId,         │
  │                   │  (except sender)    │    username }              │
  │  read_receipt     │  room members       │  { roomId, userId }        │
  │                   │  (except reader)    │                            │
  │  room_created     │  all new members    │  (triggers room refresh)   │
  │  room_updated     │  all room members   │  (triggers room refresh)   │
  │  room_deleted     │  all room members   │  (triggers room refresh)   │
  │  kicked_from_room │  kicked user only   │  { roomId }                │
  │  friend_request   │  target user        │  { fromId, fromUsername }  │
  │  friend_accepted  │  requester          │  { userId, username }      │
  └───────────────────┴─────────────────────┴────────────────────────────┘
```

---

## 5. Unread Count State Machine

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │  Zustand chatStore — unreadCounts: Record<roomId, number>           │
  └─────────────────────────────────────────────────────────────────────┘

  INITIAL LOAD (useChatRooms)
  ─────────────────────────────────────────────────────────────────────
  GET /api/chat/rooms
  Backend aggregation query:
    db.chat_messages.aggregate([
      { $match: { roomId in myRooms,
                  readBy: { $ne: myId },    ← not yet read by me
                  senderId: { $ne: myId }   ← not sent by me
                } },
      { $group: { _id: "$roomId", count: { $sum: 1 } } }
    ])
  → setUnreadCounts({ roomA: 3, roomB: 0, roomC: 7 })

  ON NEW MESSAGE (useChatWebSocket new_message handler)
  ─────────────────────────────────────────────────────────────────────
  if (!isViewingRoom && msg.senderId !== myId):
    incrementUnread(roomId):
      unreadCounts[roomId] = (unreadCounts[roomId] || 0) + 1

  ON OPEN ROOM (useChatRoom — roomId changes)
  ─────────────────────────────────────────────────────────────────────
  clearUnread(roomId):
    unreadCounts[roomId] = 0

  chatApi.markRead(roomId)              ← POST /api/chat/messages/mark-read
  Backend: db.chat_messages.update_many ← adds myId to readBy array

  ON WS RECONNECT / ROOM EVENTS (room refresh)
  ─────────────────────────────────────────────────────────────────────
  setUnreadCounts(counts) uses max-preserving merge:
    merged[roomId] = max(serverCount, currentStoreCount)
  → prevents losing WS-incremented counts on room refresh

  SIDEBAR BADGE
  ─────────────────────────────────────────────────────────────────────
  totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0)
  → shown as red badge on "Chat" nav link
```

---

## 6. Room Types and Creation

```
  ┌────────────────────────────────────────────────────────────┐
  │  Room Types                                                │
  ├─────────────────┬──────────────────────────────────────────┤
  │  direct         │  1-on-1 chat between two users           │
  │  group          │  multi-user room, named, created manually │
  │  course_group   │  auto-named from course, teacher-linked   │
  └─────────────────┴──────────────────────────────────────────┘

  Direct Room Creation:
  POST /api/chat/rooms/direct  { targetUserId }
  Backend checks if direct room already exists → returns existing roomId
  If not → creates new { type: "direct", members: [myId, targetId] }
  Both users receive "room_created" WS event → refresh room list

  Group Room:
  POST /api/chat/rooms  { name, memberIds: [...] }
  Requires ≥ 3 members (you + 2 others)
  All members receive "room_created" WS event

  Course Group:
  POST /api/chat/rooms/from-course  { courseId }
  Auto-names from course data
  Teacher + enrolled students added as members
```

---

## 7. Friend / Contact System

```
  User A wants to chat with User B (not yet friends)
          │
          │  Search: GET /api/chat/contacts/search?q=username
          ▼
  ┌──────────────────────────────────────────────────────┐
  │  User A sends friend request                         │
  │  POST /api/chat/contacts/add  { targetUserId }       │
  │                                                      │
  │  Creates: db.friend_requests { fromId, toId, status }│
  │  WS event "friend_request" → sent to User B          │
  └──────────────────┬───────────────────────────────────┘
                     │  User B sees badge in UI
                     ▼
  ┌──────────────────────────────────────────────────────┐
  │  User B accepts                                      │
  │  POST /api/chat/contacts/accept  { requestId }       │
  │                                                      │
  │  1. Update request status → "accepted"               │
  │  2. Add each user to other's contacts                 │
  │  3. WS event "friend_accepted" → sent to User A       │
  │  4. Auto-create direct chat room                     │
  └──────────────────────────────────────────────────────┘
```

---

## 8. In-Chat AI Features

```
  ChatWindow → user selects AI action:

  ┌──────────────────────────────────────────────────────────────────┐
  │  POST /api/chat/ai/*                                             │
  │  routes/chat_routes/ai_actions.py                               │
  │                                                                  │
  │  Actions available:                                              │
  │  ├── Summarise conversation   → last N messages → LLM summary   │
  │  ├── Suggest reply             → context-aware reply suggestions │
  │  └── Rewrite message           → tone adjustment                 │
  │                                                                  │
  │  All routed through AIGatewayService                             │
  │  (Coze API or local Ollama depending on config)                  │
  └──────────────────────────────────────────────────────────────────┘
```

---

## 9. MongoDB Document Schemas

```
  Collection: chat_messages
  ┌─────────────────────────────────────────────────────────────────┐
  │  {                                                              │
  │    _id:          ObjectId,                                      │
  │    roomId:       string,       ← which room                    │
  │    senderId:     string,       ← sender user id                │
  │    senderName:   string,                                        │
  │    content:      string,                                        │
  │    type:         "text" | "system" | "file",                    │
  │    recalled:     bool,         ← message recalled/deleted      │
  │    readBy:       string[],     ← array of user ids who read it  │
  │    deletedFor:   string[],     ← soft-delete per user          │
  │    replyTo:      { id, senderName, content } | null,           │
  │    sentAt:       ISO string                                     │
  │  }                                                              │
  └─────────────────────────────────────────────────────────────────┘

  Collection: chat_rooms
  ┌─────────────────────────────────────────────────────────────────┐
  │  {                                                              │
  │    _id:          ObjectId,                                      │
  │    type:         "direct" | "group",                            │
  │    name:         string | null,  ← null for un-named directs   │
  │    members:      string[],       ← user ids                    │
  │    createdBy:    string,                                        │
  │    avatarColor:  string,         ← HSL color string            │
  │    lastMessage:  { content, senderId, sentAt, readBy },        │
  │    createdAt:    ISO string                                     │
  │  }                                                              │
  └─────────────────────────────────────────────────────────────────┘
```

---

## 10. File Transfer Architecture

The **Transfer** feature lets a user forward a file attachment from chat directly into another module (Slides, Questions, Image Extractor, Diagram, Study Notes) without downloading and re-uploading manually. It uses a one-time **transfer ticket** stored in MongoDB.

```
  ═══════════════════════════════════════════════════════════════════
  PHASE 1 — CREATE TICKET  (frontend → POST /api/chat/transfers/start)
  ═══════════════════════════════════════════════════════════════════

  User sees a file message in ChatWindow
          │
          │  Clicks "Send to Module", picks target
          ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  transferApi.transferStart(roomId, messageId, targetModule, opts)    │
  │                                                                      │
  │  POST /api/chat/transfers/start                                      │
  │  { room_id, message_id, target_module, target_options }              │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Backend: ai_actions.py → transfer_start()                           │
  │                                                                      │
  │  1. _verify_room_member(room_id, uid)                                │
  │     └─ if not member → 403 Forbidden                                 │
  │                                                                      │
  │  2. db.chat_messages.find_one({ _id: message_id })                   │
  │     └─ if not found / wrong room → 400 Bad Request                   │
  │                                                                      │
  │  3. Resolve file extension:                                          │
  │     fileName → fileUrl → mimeType  (fallback chain)                  │
  │     check ext ∈ MODULE_ALLOWED_EXTENSIONS[target_module]             │
  │     └─ if ext not allowed → 400 "File type .X not supported"         │
  │                                                                      │
  │  4. _resolve_file_path(fileUrl)                                      │
  │     path traversal check: abs_path must start with CHAT_FILES_DIR   │
  │     └─ if outside safe dir → 400                                     │
  │     └─ if file missing on disk → 404                                 │
  │                                                                      │
  │  5. Read bytes → compute SHA-256 hash                                │
  │                                                                      │
  │  6. Insert ticket into db.chat_file_transfers:                       │
  │     { transfer_id: uuid4().hex,                                      │
  │       status: "created",                                             │
  │       owner_user_id: uid,                                            │
  │       source_file_url, file_meta: { name, ext, size, mime, sha256 }, │
  │       target_module, target_options,                                 │
  │       created_at: now,  expires_at: now + 24h }                      │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 │  return { transfer_id, redirect_url,
                                 │           status: "created" }
                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  target_module → redirect_url:                                       │
  │                                                                      │
  │  sub1 (Slides)          →  /slides/md-processor                      │
  │  sub2 (Questions)       →  /questions                                │
  │  sub3 (Image Extractor) →  /image-extractor                          │
  │  sub4 (Diagram)         →  /diagram                                  │
  │  sub5 (Study Notes)     →  /study-notes                              │
  │                                                                      │
  │  Frontend navigates to:  {redirect_url}?transfer_id={transfer_id}   │
  └──────────────────────────────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════════════
  PHASE 2 — PREVIEW TICKET  (target module page loads)
  ═══════════════════════════════════════════════════════════════════

  Target module page mounts, reads ?transfer_id from URL
          │
          │  transferApi.transferGet(transferId)
          ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  GET /api/chat/transfers/{transfer_id}                               │
  │                                                                      │
  │  Backend: checks owner_user_id === uid                               │
  │  └─ if not found or wrong owner → 404                                │
  │                                                                      │
  │  Returns: { transfer: { status, target_module,                       │
  │             file_meta: { name, ext, size, mime },                    │
  │             expires_at, consumed_at? } }                             │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
  Target module UI shows file preview banner:
  "  📄 lecture_notes.pdf  (2.4 MB) → Study Notes  [ Confirm ] "

  ═══════════════════════════════════════════════════════════════════
  PHASE 3 — CONSUME TICKET  (user clicks Confirm)
  ═══════════════════════════════════════════════════════════════════

  User clicks Confirm
          │
          │  transferApi.transferConsume(transferId)
          ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  POST /api/chat/transfers/{transfer_id}/consume                      │
  │                                                                      │
  │  Backend: consume_transfer(transfer_id, uid)                         │
  │                                                                      │
  │  1. Fetch ticket, verify owner_user_id === uid                       │
  │     └─ not found / wrong user → 404 / 403                            │
  │                                                                      │
  │  2. Status gate:                                                      │
  │     ├─ "consumed"  → idempotent: return cached result immediately   │
  │     ├─ "expired"   → 400 "Ticket has expired"                        │
  │     └─ "created" / "failed"  → proceed                              │
  │                                                                      │
  │  3. Expiry check:  now > expires_at ?                                │
  │     └─ yes → set status="expired" in DB  → 400                       │
  │                                                                      │
  │  4. _resolve_file_path(source_file_url)                              │
  │     └─ file missing → set status="failed", error_message  → 400      │
  │                                                                      │
  │  5. db.chat_file_transfers.update_one:                               │
  │     status = "consumed",  consumed_at = now                          │
  │                                                                      │
  │  6. Return { transfer_id, status: "consumed",                        │
  │              file_meta, source_file_url,                             │
  │              target_module, target_options }                          │
  └──────────────────────────────┬───────────────────────────────────────┘
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Frontend: transferConsumeAndDownload()                              │
  │                                                                      │
  │  1. fetchFileBlob(source_file_url)                                   │
  │     fetch(absoluteUrl, { credentials: "include" })                   │
  │     → Blob                                                           │
  │                                                                      │
  │  2. new File([blob], file_meta.name, { type: file_meta.mime })       │
  │                                                                      │
  │  3. Pass File object to target module's upload handler               │
  │     e.g. studyNotesApi.generate(file)                                │
  │          questionsApi.extract(file)                                  │
  └──────────────────────────────────────────────────────────────────────┘
          │
          │  Target module processes file normally
          ▼
  Output rendered in target module page

  ═══════════════════════════════════════════════════════════════════
  TICKET STATE MACHINE
  ═══════════════════════════════════════════════════════════════════

  ┌─────────┐  consume OK     ┌──────────┐
  │ created ├────────────────►│ consumed │  (idempotent re-read safe)
  └────┬────┘                 └──────────┘
       │
       │  now > expires_at
       ▼
  ┌─────────┐
  │ expired │
  └─────────┘

  ┌─────────┐  file missing   ┌────────┐   retry   ┌─────────┐
  │ created ├────────────────►│ failed ├──────────►│ created │
  └─────────┘                 └────────┘           └─────────┘

  ═══════════════════════════════════════════════════════════════════
  ALLOWED FILE TYPES PER MODULE
  ═══════════════════════════════════════════════════════════════════

  ┌─────────────────┬──────────────────────────┬───────────────────────┐
  │  target_module  │  destination page         │  allowed extensions   │
  ├─────────────────┼──────────────────────────┼───────────────────────┤
  │  sub1           │  /slides/md-processor    │  .pdf  .md            │
  │  sub2           │  /questions              │  .pdf  .png  .jpg     │
  │  sub3           │  /image-extractor        │  .pdf                 │
  │  sub4           │  /diagram                │  .pdf  .docx  .doc    │
  │  sub5           │  /study-notes            │  .pdf                 │
  └─────────────────┴──────────────────────────┴───────────────────────┘

  ═══════════════════════════════════════════════════════════════════
  MONGODB SCHEMA — chat_file_transfers
  ═══════════════════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────┐
  │  {                                                                  │
  │    transfer_id:      string (uuid4 hex),                            │
  │    source_room_id:   string,                                        │
  │    source_message_id: string,                                       │
  │    source_file_url:  string,   ← /static/chat_files/...            │
  │    owner_user_id:    string,   ← only this user can view/consume   │
  │    file_meta: {                                                     │
  │      name:   string,                                                │
  │      ext:    string,                                                │
  │      size:   number  (bytes),                                       │
  │      mime:   string,                                                │
  │      sha256: string                                                 │
  │    },                                                               │
  │    target_module:    string,                                        │
  │    target_options:   object,                                        │
  │    status:           "created" | "consumed" | "expired" | "failed", │
  │    created_at:       datetime,                                      │
  │    consumed_at:      datetime | null,                               │
  │    expires_at:       datetime,   ← created_at + 24h                │
  │    error_message:    string                                         │
  │  }                                                                  │
  └─────────────────────────────────────────────────────────────────────┘
```

---

*Generated: 2026-04-12*
