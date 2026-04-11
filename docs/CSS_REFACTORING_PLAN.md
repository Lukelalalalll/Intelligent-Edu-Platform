# CSS Refactoring Plan — Frontend Module CSS

> Generated from full CSS module audit. All line counts refer to current state.

---

## Diagnostic Summary

| File | Lines | Status |
|---|---|---|
| `admin/styles/AdminDashboard.module.css` | 1587 | 🔴 Split immediately |
| `question-bank/styles/sub2.module.css` | 1393 | 🔴 Split + deduplicate |
| `ai-interact/styles/AIInteract.module.css` | 1275 | 🔴 Split immediately |
| `email-agent/styles/EmailAgent.module.css` | 897 | 🟠 Split recommended |
| `grading/styles/gradingWorkbench.module.css` | 739 | 🟠 Split recommended |
| `admin/styles/AdminDbConsole.module.css` | 736 | 🟠 Split recommended |
| `diagram/styles/sub4.module.css` | 759 | 🟠 Split recommended |
| `study-notes/styles/sub5.module.css` | 703 | 🟠 Split recommended |
| `image-extractor/styles/sub3.module.css` | 674 | 🟠 Split recommended |
| `slides/styles/md_processor.module.css` | 662 | 🟡 Clean up / minor split |
| `slides/styles/pptTemplate.module.css` | 624 | 🟡 Clean up / minor split |
| `knowledge-base/styles/KnowledgeBase.module.css` | 522 | 🟡 Clean up |
| `video-gen/styles/videoGen.module.css` | 391 | 🟡 De-duplicate shared patterns |
| `question-bank/styles/ExtractPanel.module.css` | 272 | 🟡 De-duplicate btn* |
| `question-bank/styles/ScreenshotGallery.module.css` | 242 | 🟡 De-duplicate btn* |
| `chat/styles/components/*.module.css` | 477/471/406/341 | ✅ Already correctly split |

---

## 1. Question Bank — `sub2.module.css` (1393 lines)

### Findings

**13 components** all import from this single file:
```
QuestionGenerator.tsx
HistoryPanel.tsx
Step1Upload.tsx
ExerciseCard.tsx
Step2Extract/Step2Extract.tsx
Step2Extract/components/DirectSourceMode.tsx
Step2Extract/components/ExerciseListSection.tsx
Step3Generate/Step3Generate.tsx
Step3Generate/components/GenerationConfigForm.tsx
Step3Generate/components/GenerationSourceSelector.tsx
Step3Generate/components/GeneratedQuestionsPanel.tsx
Step3Generate/components/QuestionOpsPanel.tsx
```

**Duplicate classes confirmed** (classes defined identically in sub2 AND the split files):

| Classes | sub2 | ExtractPanel | ScreenshotGallery |
|---|---|---|---|
| `.btn`, `.btnPrimary`, `.btnSuccess`, `.btnWarning`, `.btnSecondary` + hover/disabled states | ✅ lines 1099-1173 | ✅ lines 41-101 | ✅ lines 2-65 |
| `.formGroup`, `.formGroup label` | ✅ | ✅ | ❌ |
| `.formControl`, `.formControl:focus` | ✅ | ✅ | ❌ |
| `.infoBox` | ✅ | ✅ | ❌ |

**Answer to your questions:**
- ExtractPanel.module.css and ScreenshotGallery.module.css DO contain classes copied from sub2 (btn* family)
- sub2 was NOT cleaned up — those btn* classes at lines 1099–1173 are now dead for ExtractPanel and ScreenshotGallery (which have their own copies), but still used by Step3Generate components
- No gallery/extract-loading specific classes were left in sub2 (those were properly moved)
- The `.stepContainer` class is **defined twice** in sub2 at lines 15 and 77 — the second definition silently overrides parts of the first

### Section Map (natural split points)

| Section | Lines (approx) | Component owner |
|---|---|---|
| Keyframes + step container + view switch | 1–100 | `QuestionGenerator.tsx` |
| Banner | 102–105 | `QuestionGenerator.tsx` |
| History view (all `history*` classes) | 106–492 | `HistoryPanel.tsx` |
| Stepper (`stepper*` classes) | 493–580 | `QuestionGenerator.tsx` |
| Step view wrapper | 581–671 | `QuestionGenerator.tsx` |
| Step internals (upload, pages, config, mode cards) | 672–1000 | `Step1Upload.tsx`, `GenerationConfigForm.tsx`, `GenerationSourceSelector.tsx` |
| Exercise items + content | 916–1025 | `ExerciseCard.tsx`, `ExerciseListSection.tsx` |
| Source cards | 1026–1073 | `GenerationSourceSelector.tsx` |
| Loading + export options | 1074–1098 | shared |
| Button system (`btn*`) | 1099–1173 | everywhere |
| Markdown container | 1175–1227 | `HistoryPanel.tsx`, `ExerciseCard.tsx` |
| Step2 layout (scrollArea + bottomBar) | 1228–1270 | `Step2Extract.tsx` |
| Extract toolbar | 1271–1298 | `ExerciseListSection.tsx` |
| Exercise action buttons | 1299–1392 | `QuestionOpsPanel.tsx` |

### Recommended File Split

```
question-bank/styles/
├── sub2.module.css           → KEPT as orchestrator (keyframes, stepContainer, viewSwitch, stepperWrap, stepView — ~200 lines)
├── history.module.css        → NEW: all history* classes (~390 lines)
├── step1Upload.module.css    → NEW: uploadArea, pages, configGrid, modeCards, formGroup, formControl (~330 lines)
├── exerciseCard.module.css   → NEW: exerciseItem, exerciseContent, exerciseMeta, sourceCard, markdownContainer (~280 lines)
├── step2Layout.module.css    → NEW: step2Wrapper, step2ScrollArea, step2BottomBar, extractToolbar (~90 lines)
├── questionOps.module.css    → NEW: exerciseActions, btnScreenshot, btnGallery, btnDanger (~100 lines)
├── ExtractPanel.module.css   → KEEP (remove copied btn* from it, import from shared/btn)
├── ScreenshotGallery.module.css → KEEP (remove copied btn* from it, import from shared/btn)
└── shared/
    └── btn.module.css        → NEW: btn, btnPrimary, btnSuccess, btnWarning, btnSecondary (~80 lines)
```

**Immediate wins without any component changes:**
1. Move the `btn*` block from sub2 (lines 1099-1173) into a new `styles/shared/btn.module.css`
2. In ExtractPanel.module.css and ScreenshotGallery.module.css, replace the copied btn* blocks with a re-export from `shared/btn.module.css`
3. Fix the duplicate `.stepContainer` definition (lines 15 vs 77) — merge into a single block

---

## 2. Admin — `AdminDashboard.module.css` (1587 lines)

### Section Map

| Section | Lines | Description |
|---|---|---|
| Core layout | 1–793 | Base layout, stats cards, tables, modals, selects |
| LLM Monitor Panel | 794–1103 | Charts, monitor-specific UI |
| API Key Panel | 1104–1324 | Key management form/table |
| RAG Eval Panel | 1325–1587 | RAG evaluation results view |

### Recommended Split

```
admin/styles/
├── AdminDashboard.module.css → TRIMMED to core layout (lines 1–793, ~793 lines)
├── LlmMonitorPanel.module.css → NEW: extracted from lines 794–1103 (~310 lines)
├── ApiKeyPanel.module.css     → NEW: extracted from lines 1104–1324 (~220 lines)
└── RagEvalPanel.module.css    → NEW: extracted from lines 1325–1587 (~263 lines)
```

Each panel component should import only its own CSS file, not the full AdminDashboard.

---

## 3. AI Interact — `AIInteract.module.css` (1275 lines)

### Section Map

| Section | Lines | Description |
|---|---|---|
| Main layout | 1–79 | Page layout, panels |
| Resizer | 80–105 | Drag handle |
| Sidebar / History | 106–682 | History list, items, delete |
| Markdown + bubbles | 683–748 | Message rendering |
| Sidebar button tweaks | 749–789 | Minor sidebar overrides |
| Code block tweaks | 790–827 | Copy button |
| Full copy button | 828–888 | Bottom copy |
| Dark code box | 889–1001 | Mac-style code frame |
| Custom modal | 1002–1098 | Delete confirm |
| Memory modal | 1099–1154 | Memory form |
| Memory button | 1155–1275 | Header memory button |

### Recommended Split

```
ai-interact/styles/
├── AIInteract.module.css     → TRIMMED to layout + resizer (~110 lines)
├── AIHistory.module.css      → NEW: sidebar + history list (~580 lines)
├── AIMarkdown.module.css     → NEW: markdown, bubbles, code blocks (~320 lines)
├── AIModal.module.css        → NEW: delete modal + memory modal (~160 lines)
└── AIMemory.module.css       → NEW: memory button in header (~120 lines)
```

---

## 4. Email Agent — `EmailAgent.module.css` (897 lines, 103 classes)

### Analysis

No section comments. The file covers a two-panel layout: email list (left) + detail view (right) with an inline reply editor.

### Natural split boundaries

| Section | Classes | Approx lines |
|---|---|---|
| Page shell + header | page, bgOrb*, shell, headerCard, backBtn, actions, connectionBadge*, connectBtn, disconnectBtn, errorBox, successBox | 1–265 |
| Email list panel | workspace, listPanel, listHeader, emailList, emailListItem, emailItem, itemAccent, rowTop, senderWrap, snippet | 265–435 |
| Email detail panel | detailPanel, detailEmpty, detailCard, detailToolbar, detailHeader, headerMeta, classifyBadge, aiSummary, metaGrid, bodyWrap, plainBody, htmlBody | 437–620 |
| Reply section | replySection, replyBox, replyHeader, replyInput, replyActions, aiDraftBtn, cancelBtn, sendBtn | 621–767 |

### Recommended Split

```
email-agent/styles/
├── emailShell.module.css  → NEW: page, header, connection state, errors (~265 lines)
├── emailList.module.css   → NEW: list panel classes (~170 lines)
├── emailDetail.module.css → NEW: detail panel classes (~185 lines)
├── emailReply.module.css  → NEW: reply editor section (~150 lines)
└── EmailProviderSelect.module.css → KEEP as-is (370 lines, already separate)
```

---

## 5. Grading — `gradingWorkbench.module.css` (739 lines)

### Section Map

| Section | Lines | Description |
|---|---|---|
| Layout | 15–114 | Main workbench layout |
| Animations | 115–196 | slideInRight + stagger |
| Cards | 197–231 | Generic card style |
| PDF card detail | 232–297 | Inner PDF card elements |
| Coze chat area | 298–521 | Chat bubbles, input, panel |
| Buttons + misc | 522–739 | Button overrides, responsive |

### Recommended Split

```
grading/styles/
├── gradingWorkbench.module.css → TRIMMED to layout + animations (~200 lines)
├── gradingCards.module.css     → NEW: card + PDF card detail (~100 lines)
├── gradingChat.module.css      → NEW: full Coze chat area (~225 lines)
└── gradingButtons.module.css   → NEW: buttons + responsive (~215 lines)
```

---

## 6. Image Extractor — `sub3.module.css` (674 lines)

### Section Map (already annotated)

| Section | Lines | Description |
|---|---|---|
| Base layout | 1–125 | Container, header zones |
| Upload Area | 126–182 | Drag-drop upload zone |
| Controls | 183–265 | Control bar |
| Gallery | 266–409 | Grid of extracted images |
| Selected Gallery | 410–473 | Selection state |
| Export | 474–509 | Export button area |
| Lightbox Modal | 510–558 | Full-screen image view |
| Notifications & Loading | 559–674 | Toast + spinner |

### Recommended Split (this file is well-commented — easiest to split)

```
image-extractor/styles/
├── sub3.module.css          → TRIMMED to layout + upload + controls (~265 lines)
├── imageGallery.module.css  → NEW: gallery + selection (~208 lines)
├── imageLightbox.module.css → NEW: lightbox modal (~50 lines)
└── imageNotifications.module.css → NEW: toasts + loading (~115 lines)
```

---

## 7. Diagram — `sub4.module.css` (759 lines)

### Section Map

| Section | Lines | Description |
|---|---|---|
| Core diagram UI | 1–334 | Layout, canvas, toolbar |
| SVG Editor | 335–453 | SVG-specific editing UI |
| Modal | 454–589 | Dialog/modal overlay |
| GenSection (3-tab + SVG) | 590–759 | Generation panel tabs |

### Recommended Split

```
diagram/styles/
├── sub4.module.css          → TRIMMED to core diagram UI (~334 lines)
├── svgEditor.module.css     → NEW: SVG editor zone (~120 lines)
├── diagramModal.module.css  → NEW: modal overlay (~136 lines)
└── genSection.module.css    → NEW: generation tab panel (~170 lines)
```

---

## 8. Study Notes — `sub5.module.css` (703 lines)

### Analysis

No section comments. Needs a class-level audit before splitting.

### Recommended approach

Run `grep -n "^\." frontend/src/features/study-notes/styles/sub5.module.css` and group class names by the component that uses them. Then split by component file (similar to how chat is structured — each sub-component gets its own CSS module).

The study-notes feature likely has: outline panel, note editor, markdown preview, sidebar, toolbar. Target 3–4 files of ~175 lines each.

---

## 9. Admin DB Console — `AdminDbConsole.module.css` (736 lines)

### Analysis

No section comments found. Run the same class-audit. The file likely covers: query editor, results table, schema browser, connection panel. Target 3 files.

---

## 10. Slides — Multiple files

| File | Lines | Action |
|---|---|---|
| `md_processor.module.css` | 662 | Split at existing section comments (sections 6, 7a, 7b, 8 are natural boundaries) |
| `pptTemplate.module.css` | 624 | Needs class audit — no comments |
| `quickProcess.module.css` | 442 | Acceptable as-is, add section comments |
| `highlighter.module.css` | 324 | Acceptable as-is |

**For `md_processor.module.css`:**
```
slides/styles/
├── md_processor.module.css  → TRIMMED to sections 1–5 (layout, file info, base styles ~350 lines)
├── mdTabBar.module.css      → NEW: section 7a Tab Bar (~60 lines)
├── mdKeyframes.module.css   → NEW: section 8 Keyframes (~65 lines)
```

---

## 11. Knowledge Base — `KnowledgeBase.module.css` (522 lines)

### Section Map (already annotated)

| Section | Lines | Description |
|---|---|---|
| Page layout | 1–48 | Base page shell |
| Menu/Panel styles | 49–105 | Nav panel |
| Document Manager | 106–162 | Doc list |
| Settings Box | 164–243 | Settings form |
| Card lists | 244–312 | Document cards |
| Chapter Toolbar | 313–373 | Toolbar |
| Document Header | 374–400 | Doc header |
| Add Chapter Modal | 401–522 | Modal overlay |

### Recommended Split

```
knowledge-base/styles/
├── KnowledgeBase.module.css → TRIMMED to layout + nav panel (~105 lines)
├── docManager.module.css    → NEW: doc manager + settings (~155 lines)
├── docCards.module.css      → NEW: card lists + toolbar + header (~160 lines)
└── addChapterModal.module.css → NEW: modal (~122 lines)
```

---

## 12. Video Gen — `videoGen.module.css` (391 lines) ⚠️ Cross-feature duplicate

### Critical Finding

The file contains explicit comments:
```css
/* ── Stepper (matches sub2 stepperWrap) ── */
/* ── Step Card (matches sub2 stepContainer) ── */
```

This means the **stepper and step-card design pattern is manually copy-pasted** between `video-gen` and `question-bank`. Any style change requires updating both files.

### Recommendation

Extract the shared stepper/step-card pattern into a **design-system-level shared CSS**:

```
shared/
└── styles/
    ├── stepper.module.css     → stepperWrap, stepperItem, stepperCircle, stepperLabel (shared by video-gen + question-bank)
    ├── stepCard.module.css    → stepContainer, stepView, viewSwitch, sub-step animations (shared)
    └── btn.module.css         → btn, btnPrimary, btnSuccess, btnWarning, btnSecondary (shared by question-bank x3 files)
```

Both `video-gen` and `question-bank` features then import from `shared/styles/`.

---

## Priority Order

| Priority | Task | Effort | Impact |
|---|---|---|---|
| 1 | Fix `.stepContainer` duplicate in sub2 (lines 15 + 77) | 5 min | Bug fix |
| 2 | Create `shared/styles/btn.module.css`, remove btn* copies from ExtractPanel + ScreenshotGallery | 30 min | -160 lines of duplication |
| 3 | Split sub2 → history.module.css (move `history*` classes) | 45 min | -390 lines from sub2 |
| 4 | Extract shared stepper CSS (video-gen + question-bank share it) | 1 hr | Cross-feature dedup |
| 5 | Split AdminDashboard (3 independent panel sections) | 1 hr | -800 lines from monolith |
| 6 | Split AIInteract (history sidebar + markdown + modals) | 1 hr | -900 lines from monolith |
| 7 | Finish sub2 split (step1Upload, exerciseCard, step2Layout, questionOps) | 1.5 hr | -600 lines from sub2 |
| 8 | Split EmailAgent, sub3, sub4 | 2 hr | -700+ lines distributed |
| 9 | Audit sub5, AdminDbConsole (no comments, need class-map first) | 1 hr each | TBD |
| 10 | Extract KnowledgeBase modal + doc cards | 45 min | Good for maintainability |

---

## General CSS Module Conventions (going forward)

1. **Max ~300 lines per file** — if a CSS module exceeds this, audit for logical splits
2. **One component → one CSS module** — co-locate `ComponentName.module.css` with `ComponentName.tsx`
3. **No cross-component style sharing via one large monolith** — use `shared/styles/` for truly shared design tokens (steppers, buttons)
4. **Section comments required** — every logical section must start with `/* ===== Section Name ===== */`
5. **No duplicate class definitions within one file** — CSS Modules process top-to-bottom; duplicates are silent overrides
6. **Reference: chat/styles/** — already follows the correct per-component pattern, use as template
