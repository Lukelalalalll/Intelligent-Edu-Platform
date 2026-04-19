"""Light 模板内容处理器

负责：
1. 字体大小计算（针对 Light 模板的占位符尺寸调校）
2. 双栏分割逻辑：bullet 数量 >= TWO_COL_THRESHOLD 时拆成左右两列
"""

from pptx.util import Pt

# 触发双栏布局的 bullet 数量阈值
TWO_COL_THRESHOLD = 5


class LightContentProcessor:
    """Light 模板内容处理器"""

    def __init__(self):
        pass

    # ------------------------------------------------------------------
    # 公开 API
    # ------------------------------------------------------------------

    def get_font_sizes(self, content_list, title=""):
        """计算内容字体大小和标题字体大小

        Returns:
            tuple: (content_font_size: Pt, title_font_size: Pt | None)
        """
        bullet_count = len(content_list)
        if bullet_count == 0:
            return Pt(18), None

        total_chars = sum(len(c) for c in content_list)
        avg_chars = total_chars / bullet_count

        content_pt = self._calc_content_pt(bullet_count, avg_chars)
        title_pt = self._calc_title_pt(title)
        return content_pt, title_pt

    def should_use_two_columns(self, content_list):
        """判断是否应该使用双栏布局"""
        return len(content_list) >= TWO_COL_THRESHOLD

    def split_two_columns(self, content_list):
        """将内容列表拆分为左右两栏

        Returns:
            tuple: (left_col: list[str], right_col: list[str])
        """
        mid = (len(content_list) + 1) // 2  # 左列略多或相等
        return content_list[:mid], content_list[mid:]

    # ------------------------------------------------------------------
    # 内部逻辑
    # ------------------------------------------------------------------

    def _calc_content_pt(self, bullet_count, avg_chars):
        """根据 bullet 数量和平均字符数决定字体大小"""
        if avg_chars > 120:
            return Pt(11)
        if bullet_count <= 3 and avg_chars < 60:
            return Pt(18)
        if bullet_count <= 4 and avg_chars < 80:
            return Pt(16)
        if bullet_count <= 6:
            return Pt(14)
        return Pt(12)

    def _calc_title_pt(self, title):
        """标题字数较多时缩小字体"""
        if not title:
            return None
        word_count = len(title.split())
        char_count = len(title)
        if char_count > 40 or word_count > 8:
            return Pt(24)
        return None  # 使用模板默认大小
