"""Dark 模板内容处理器

Dark 模板每个内容布局都带有 PICTURE(18) 和 OBJECT(7) 占位符，
文字内容区域是 BODY(2)，字体适配策略需要考虑到图片占了约一半版面，
可用文字区域比 Light/Business 更窄。
"""

from pptx.util import Pt


class DarkContentProcessor:
    """Dark 模板内容处理器"""

    def __init__(self):
        pass

    def get_font_sizes(self, content_list: list, title: str = ""):
        """计算内容字体大小和标题字体大小

        Dark 布局的文字区域通常只占幻灯片宽度的 40-50%（另一半是图片），
        所以字体整体比 Light 小一档。

        Returns:
            tuple: (content_font_size: Pt, title_font_size: Pt | None)
        """
        bullet_count = len(content_list)
        if bullet_count == 0:
            return Pt(16), None

        total_chars = sum(len(c) for c in content_list)
        avg_chars = total_chars / bullet_count

        content_pt = self._calc_content_pt(bullet_count, avg_chars)
        title_pt = self._calc_title_pt(title)
        return content_pt, title_pt

    # ------------------------------------------------------------------
    # 内部逻辑
    # ------------------------------------------------------------------

    def _calc_content_pt(self, bullet_count: int, avg_chars: float) -> Pt:
        """Dark 文字区域较窄，整体比 Light 降一档"""
        if avg_chars > 120:
            return Pt(10)
        if bullet_count <= 2 and avg_chars < 50:
            return Pt(16)
        if bullet_count <= 3 and avg_chars < 80:
            return Pt(14)
        if bullet_count <= 5:
            return Pt(12)
        return Pt(11)

    def _calc_title_pt(self, title: str):
        """标题字数多时缩小"""
        if not title:
            return None
        if len(title) > 35 or len(title.split()) > 7:
            return Pt(22)
        return None  # 使用模板默认大小
