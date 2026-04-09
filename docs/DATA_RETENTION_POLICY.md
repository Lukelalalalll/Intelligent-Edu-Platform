# Data Retention Policy (Server Deployment)

Last updated: 2026-04-09

## 1. Scope

This policy applies to chat data, AI session data, uploaded files, and knowledge-base indexing artifacts.

## 2. Retention Rules

### 2.1 Long-term business data (no TTL)

- `chat_rooms`
- `chat_messages`
- `ai_chat_sessions`
- `file_assets` (registry)

These collections are retained permanently by default.

### 2.2 Operational logs / cache (TTL allowed)

- `chat_ai_jobs`: 90 days
- `email_classifications`: 7 days
- `indexing_jobs`: 180 days
- telemetry collections: 90 days

These collections are non-primary records and can be expired automatically.

### 2.3 File storage

Files are stored on disk and must not be auto-deleted by scheduled jobs:

- `backend/static/chat_files`
- `backend/uploads/submissions`
- `backend/uploads/knowledge_base`
- `backend/generated/vectorstore/courses`

Deletion is controlled via Admin File Center workflow.

## 3. File Lifecycle Governance

All managed files should have one `file_assets` registry record.

### 3.1 Status model

- `active`: available for use
- `soft_deleted`: hidden from normal usage, recoverable
- `hard_deleted`: final state, disk deletion attempted

### 3.2 Required workflow

1. Soft delete first.
2. Restore if needed.
3. Hard delete only after reference check passes.

## 4. Audit and Data Integrity

Admin File Center provides:

- orphan disk files: file exists on disk but missing in registry
- dangling registry entries: registry exists but file path is missing

Run audits regularly before major cleanup operations.

## 5. Backup and Restore (Single-server baseline)

Daily routine:

1. MongoDB full backup (`mongodump`)
2. Incremental backup of file directories

Retention recommendation:

- daily snapshots: 7 days
- weekly snapshots: 4 weeks
- monthly snapshots: 3 months

Monthly restore drill:

1. Restore to isolated path.
2. Randomly verify checksums and key records.

## 6. Change Control

Any TTL, deletion logic, or storage path changes must be reviewed by admin and documented in this file.
