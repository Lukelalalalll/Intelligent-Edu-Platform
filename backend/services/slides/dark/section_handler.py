"""Dark 模板章节/结尾页处理器

扫描确认的布局结构：
  [6] "Section"  → TITLE(1) + DATE(16) + FOOTER(15) + SLIDE_NUMBER(13) + BODY(2)
                   ↑ 章节大标题用 type 1，副标题/子标题列表用 type 2
  [7] "Ending"   → TITLE(1) + DATE(16) + FOOTER(15) + SLIDE_NUMBER(13)
                   ↑ 只有标题，无副标题占位符

注意：Dark 的 Section/Ending 用的是 TITLE(1) 而不是 CENTER_TITLE(3)，
与 Business/Light 不同，务必用 type 1 填写。
"""

import re

MAX_SECTIONS = 6

_SECTION_KEYWORDS = [
    'introduction', 'abstract', 'method', 'methodology', 'approach',
    'experiment', 'evaluation', 'result', 'analysis', 'discussion',
    'conclusion', 'related work', 'background', 'implementation',
    '引言', '简介', '方法', '实验', '结果', '分析', '讨论', '结论', '背景',
]

_END_SLIDE_TITLE = 'Thank You'


class DarkSectionHandler:
    """Dark 模板章节/结尾页处理器"""

    def __init__(self):
        self.main_headers_with_numbers: list[str] = []

    # ------------------------------------------------------------------
    # 主章节选取（与 Light 逻辑相同，复用思路）
    # ------------------------------------------------------------------

    def select_main_headers(self, slides_data: list) -> list[str]:
        """选出最多 MAX_SECTIONS 个主章节标题（返回去编号版本）"""
        all_titles = [s['title'] for s in slides_data if s.get('title')]

        if len(all_titles) <= MAX_SECTIONS:
            self.main_headers_with_numbers = list(all_titles)
            return [self._strip_number(t) for t in all_titles]

        priority: list[str] = []
        for title in all_titles:
            lower = title.lower()
            if any(kw in lower for kw in _SECTION_KEYWORDS):
                if title not in priority:
                    priority.append(title)

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
        """创建 Dark 章节分隔页（布局名：'Section'）

        Section 布局占位符：
          type 1  → 填章节大标题
          type 2  → 填子标题列表（可空）
          type 13/15/16 → 跳过
        """
        layout = layout_finder(prs, 'Section')
        if layout is None:
            print("⚠️ [Dark] 'Section' layout not found, skipping section slide")
            return None

        slide = prs.slides.add_slide(layout)
        title_text = self._strip_number(section_data.get('title', ''))
        subtitle_text = section_data.get('subtitle', '')

        for shape in slide.shapes:
            if not shape.is_placeholder:
                continue
            ph_type = shape.placeholder_format.type
            if ph_type == 1:      # TITLE → 章节大标题
                shape.text = title_text
            elif ph_type == 2:    # BODY → 子标题/内容摘要
                shape.text = subtitle_text
            # type 13/15/16 不填，保持模板默认

        return slide

    # ------------------------------------------------------------------
    # 结尾页
    # ------------------------------------------------------------------

    def create_end_slide(self, prs, layout_finder,
                         title_text: str = _END_SLIDE_TITLE,
                         subtitle_text: str = '') -> object | None:
        """创建 Dark 结尾页（布局名：'Ending'）

        Ending 布局只有 type 1，无副标题占位符。
        """
        layout = layout_finder(prs, 'Ending')
        if layout is None:
            print("⚠️ [Dark] 'Ending' layout not found, skipping end slide")
            return None

        slide = prs.slides.add_slide(layout)

        for shape in slide.shapes:
            if not shape.is_placeholder:
                continue
            ph_type = shape.placeholder_format.type
            if ph_type == 1:      # TITLE
                shape.text = title_text
            # type 13/15/16 跳过

        return slide

    # ------------------------------------------------------------------
    # 辅助
    # ------------------------------------------------------------------

    @staticmethod
    def _strip_number(title: str) -> str:
        return re.sub(r'^\d+(?:\.\d+)*\.?\s*', '', title).strip()

    def get_section_subtitle(self, current_title: str, all_slides: list) -> str:
        """生成章节副标题：当前章节下的子标题列表（至多 4 条）"""
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
