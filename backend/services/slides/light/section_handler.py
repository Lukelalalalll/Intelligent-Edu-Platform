"""Light 模板章节/结尾页处理器

功能：
1. select_main_headers()  — 从所有幻灯片中选出最多 MAX_SECTIONS 个主章节
2. create_section_slide() — 使用 "Section title" 布局插入章节分隔页
3. create_end_slide()     — 使用 "End Slide" 布局插入结尾页

Light 模板布局说明（来自模板实际扫描）：
  "Section title" → type 3 (CENTER_TITLE) + type 4 (SUBTITLE)
  "End Slide"     → type 3 (CENTER_TITLE) + type 4 (SUBTITLE)
"""

import re

# Light 最多支持几个主章节占位
MAX_SECTIONS = 6

# 常见章节关键词（中英文）
_SECTION_KEYWORDS = [
    'introduction', 'abstract', 'method', 'methodology', 'approach',
    'experiment', 'evaluation', 'result', 'analysis', 'discussion',
    'conclusion', 'related work', 'background', 'implementation',
    '引言', '简介', '方法', '实验', '结果', '分析', '讨论', '结论', '背景',
]


class LightSectionHandler:
    """Light 模板章节/结尾页处理器"""

    def __init__(self):
        # 保留编号的主章节标题列表，供外部匹配
        self.main_headers_with_numbers: list[str] = []

    # ------------------------------------------------------------------
    # 主章节选择
    # ------------------------------------------------------------------

    def select_main_headers(self, slides_data: list) -> list[str]:
        """从所有幻灯片中选择主章节标题（去掉编号后返回）

        Args:
            slides_data: ppt_schema['slides'] 列表

        Returns:
            清洗后的主章节标题（不含前置数字编号）
        """
        all_titles = [s['title'] for s in slides_data if s.get('title')]

        if len(all_titles) <= MAX_SECTIONS:
            self.main_headers_with_numbers = list(all_titles)
            return [self._strip_number(t) for t in all_titles]

        # 第一优先：包含章节关键词
        priority: list[str] = []
        for title in all_titles:
            lower = title.lower()
            if any(kw in lower for kw in _SECTION_KEYWORDS):
                if title not in priority:
                    priority.append(title)

        # 补足数量（按原始顺序均匀抽样）
        if len(priority) < MAX_SECTIONS:
            step = max(1, len(all_titles) // MAX_SECTIONS)
            for i in range(0, len(all_titles), step):
                t = all_titles[i]
                if t not in priority:
                    priority.append(t)
                if len(priority) >= MAX_SECTIONS:
                    break

        selected = priority[:MAX_SECTIONS]
        self.main_headers_with_numbers = selected
        return [self._strip_number(t) for t in selected]

    # ------------------------------------------------------------------
    # 章节分隔页
    # ------------------------------------------------------------------

    def create_section_slide(self, prs, section_data: dict, layout_finder) -> object | None:
        """创建 Light 章节分隔页

        Args:
            prs:           python-pptx Presentation 对象
            section_data:  dict，含 'title' 和 'subtitle'（可选）
            layout_finder: callable(prs, name) → layout | None

        Returns:
            新建的 Slide 对象，失败时返回 None
        """
        layout = layout_finder(prs, 'Section title')
        if layout is None:
            print("⚠️ [Light] 'Section title' layout not found, skipping section slide")
            return None

        slide = prs.slides.add_slide(layout)
        title_text = self._strip_number(section_data.get('title', ''))
        subtitle_text = section_data.get('subtitle', '')

        for shape in slide.shapes:
            if not shape.is_placeholder:
                continue
            ph_type = shape.placeholder_format.type
            if ph_type == 3:          # CENTER_TITLE
                shape.text = title_text
            elif ph_type == 4:        # SUBTITLE
                shape.text = subtitle_text

        return slide

    # ------------------------------------------------------------------
    # 结尾页
    # ------------------------------------------------------------------

    def create_end_slide(self, prs, layout_finder,
                         title_text: str = "Thank You",
                         subtitle_text: str = "") -> object | None:
        """创建 Light 结尾页

        Args:
            prs:           python-pptx Presentation 对象
            layout_finder: callable(prs, name) → layout | None
            title_text:    结尾大标题，默认 "Thank You"
            subtitle_text: 结尾副标题

        Returns:
            新建的 Slide 对象，失败时返回 None
        """
        layout = layout_finder(prs, 'End Slide')
        if layout is None:
            print("⚠️ [Light] 'End Slide' layout not found, skipping end slide")
            return None

        slide = prs.slides.add_slide(layout)

        for shape in slide.shapes:
            if not shape.is_placeholder:
                continue
            ph_type = shape.placeholder_format.type
            if ph_type == 3:      # CENTER_TITLE
                shape.text = title_text
            elif ph_type == 4:    # SUBTITLE
                shape.text = subtitle_text

        return slide

    # ------------------------------------------------------------------
    # 辅助
    # ------------------------------------------------------------------

    @staticmethod
    def _strip_number(title: str) -> str:
        """去掉标题前面的数字编号，如 '1.2 Introduction' → 'Introduction'"""
        return re.sub(r'^\d+(?:\.\d+)*\.?\s*', '', title).strip()

    def get_section_subtitle(self, current_title: str, all_slides: list) -> str:
        """生成章节页副标题：列举本章节下的子标题（至多 4 条）"""
        start_idx = None
        for i, s in enumerate(all_slides):
            if s['title'] == current_title:
                start_idx = i
                break
        if start_idx is None:
            return ''

        sub_titles = []
        for s in all_slides[start_idx + 1:]:
            if s['title'] in self.main_headers_with_numbers:
                break
            sub_titles.append(self._strip_number(s['title']))
            if len(sub_titles) >= 4:
                break

        return '  ·  '.join(sub_titles) if sub_titles else ''
