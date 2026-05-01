# PPT Template 后端优化方案（2026-04-13）

## 1. 当前后端生成链路（基于代码走读）

1. 路由入口：`/api/slides/process-ppt` 调用 `_create_ppt`，实例化 `PPTCreator` 后执行 `create_presentation`。
2. 上游内容：`/summarize` 或 `/summarize_in_chapters` 产出 `title/content/latex/chart_type/chart_reasoning`。
3. 可选映射：`map_summaries_to_slides` 会把 `key_points + evidence` 合并为 `content`，并给出 layout 建议。
4. 模板填充：`PPTCreator._process_placeholders` 依据 placeholder type 写入标题、正文、图片、表格、公式。
5. 文本策略：正文使用 `text_frame.auto_size = TEXT_TO_FIT_SHAPE + word_wrap`，但未做“容量预测 + 分页拆分”。

---

## 2. 现状问题与根因

### P0: Business 专用创建器几乎未生效（高概率回退默认）
- `PPTCreator._get_specialized_creator()` 动态导入路径是 `utils.{theme}_ppt_creator`，但实际文件在 `services/slides/output/business_ppt_creator.py`。
- 这会导致 Business 模板的专用逻辑（动态布局、专属占位符策略）无法稳定生效，最终退回默认创建器。

影响：你看到的“字体过大、布局奇怪”会更频繁，因为默认策略比较粗糙。

### P0: 字号策略与版式容量脱钩
- 当前字号规则只看 bullet 数和平均词数，未读取“占位符宽高、行高、段间距、语言类型（中英）”。
- 同一字号在不同 layout 里可容纳行数不同，但代码没有按 layout 做差异化。

影响：在窄文本框或多段内容时，容易超界或压缩异常。

### P0: 自动缩放策略不可控
- `MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE` 会触发 PowerPoint 自动缩放，但结果不稳定，容易出现某页突然很小/很大。
- 代码未设置最小字号、也没有溢出降级策略（截断、拆页、换布局）。

影响：排版风格不一致，视觉“忽大忽小”。

### P1: 内容分配策略是“按索引写入”，不是“按容量写入”
- Business 中 `target_indices = [0,2,4]` 这类固定映射，与实际占位符尺寸无关。
- `shape.text = content` 直接写入，不做单条 bullet 长度治理。

影响：某些版式下文本集中到少数框里，导致溢出。

### P1: 上游摘要约束与下游版式约束不闭环
- 提示词虽要求 `num_of_bullets/words_each_bullet`，但模型输出仍会有偏差。
- `summarize_in_chapters` 实际调用的是 `SectionSummarizer.summarize_sections(...)`，返回后直接 `results[:total_pages]` 截断，未做按章节页预算分配。

影响：内容密度波动大，导致下游排版难以稳定。

### P2: 潜在稳定性问题
- `BusinessPPTCreator.create_presentation()` 调用了 `self._apply_speaker_notes(...)`，但当前继承链中没有该方法定义，若专用创建器真正启用会触发运行时异常。

---

## 3. 优化目标（可量化）

1. 文本溢出率（文本框越界或可见裁切）从当前未知降到 `<2%`。
2. 自动缩放触发率（依赖 PPT 内置 TEXT_TO_FIT_SHAPE）降到 `<10%`。
3. 版式一致性评分（同批次字号离散度）提升到 `>=90/100`。
4. 失败可恢复性：单页失败不影响整份 PPT 交付（已有基础，继续增强）。

---

## 4. 优化方案（按优先级）

## 4.1 第一阶段（1-2 天，先止血）

1. 修复 specialized creator 导入路径
- 把 `utils.business_ppt_creator` 改为正确模块路径（建议显式导入映射，避免字符串反射）。
- 增加启动自检：主题=Business 时打印“是否命中专用创建器”。

2. 关闭默认 `TEXT_TO_FIT_SHAPE`，改为“受控缩放”
- 先按推荐字号写入。
- 计算估算行数（字符宽度近似 + 占位符宽度）。
- 若超界：按阶梯降字号（例如 18 -> 16 -> 14 -> 12 -> 11）。
- 仍超界则触发降级：
	- 优先换布局（Title and Content -> Two Content / Title, Content, and Image）；
	- 再不行则拆分为续页。

3. 增加 bullet 清洗器（后端强约束）
- 单条过长时按标点切分；
- 强制每页 bullet 上限（建议 5）；
- 强制每条词数/字数上限（中英分开阈值）。

4. 加入可观测日志
- 每页记录：layout、占位符尺寸、初始字号、最终字号、是否拆页、是否换布局。

## 4.2 第二阶段（3-5 天，稳定提升）

1. 建立“布局容量模型”
- 对每个模板 layout 的 type=2 占位符预计算 `max_lines_at_font_size`。
- 生成时先预测容量，再决定：
	- layout 选择
	- bullet 数
	- 字号档位

2. 将 template_mapper 从“语义 hint”升级为“语义 + 容量双约束”
- 目前仅根据 `slide_hint` 推荐 layout。
- 新增输入：`layout_capacities`，在 map 阶段就做容量匹配，减少下游回退。

3. 上游摘要闭环
- `summarize_in_chapters` 改为调用 `ChapterSummarizer`（或引入章节页数分配逻辑），避免简单截断。
- 摘要结果通过 `validate_presentation` 后再进入 PPT 生成；超限自动重写（一次）。

4. 异常兜底完善
- 补齐/删除 `_apply_speaker_notes` 调用。
- 对单页异常附加默认 layout 重试一次。

## 4.3 第三阶段（1-2 周，体验优化）

1. 增加“排版预检 API”
- 输入 `ppt_schema + theme`，返回每页风险评分（溢出概率、建议字号、建议布局）。

2. 批量回归与质量门禁
- 构建 50-100 组中英文样本（短句、长句、公式、混排）。
- CI 检查：溢出率、字号离散度、失败率。

3. 可视化诊断
- 导出每页 bounding boxes（json）+ 关键指标，便于前端显示“这页为何挤”。

---

## 5. 建议的技术改造点（代码级）

1. 在 `PPTCreator` 增加统一文本布局引擎（建议新模块）
- `services/slides/output/text_layout_engine.py`
- 提供：
	- `estimate_text_box_usage(texts, shape, font_size, lang)`
	- `fit_text_with_fallback(texts, shape, style_policy)`

2. 在 `_process_placeholders` / `BusinessPlaceholderProcessor` 中统一调用引擎
- 代替直接 `shape.text = ...`。

3. 在 `template_mapper` 增加容量输入
- `map_summary_to_slide(..., layout_capacities=...)`。

4. 在 routes 层加入质量闸门
- `summarize -> validate -> map -> validate -> process_ppt`。

---

## 6. 验收标准

1. 随机 100 页中英文混合样本：无肉眼可见文字越界。
2. 同一份文档内正文最终字号标准差显著下降（建议 < 1.5pt）。
3. Business 主题命中专用创建器成功率 100%。
4. 章节页生成数量与 `total_pages` 偏差为 0（不再依赖尾部截断）。

---

## 7. 实施顺序（建议）

1. 先修导入路径 + `_apply_speaker_notes` 风险点。
2. 再落地文本布局引擎（受控缩放 + 拆页）。
3. 再做 mapper 容量化与章节摘要闭环。
4. 最后补 CI 样本与排版预检 API。

该顺序可以在不重构全链路的前提下，最快把“字体超界/排版怪异”从高频问题降为低频边缘问题。

