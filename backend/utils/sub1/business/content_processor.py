from pptx.util import Pt

class BusinessContentProcessor:
    """Business模板的内容处理器"""
    
    def __init__(self):
        pass
    
    def get_font_sizes(self, content_list, title=""):
        """一次性计算并返回所有需要的字体大小
        
        Args:
            content_list (list): 内容列表
            title (str, optional): 标题文本
            
        Returns:
            tuple: (content_font_size, title_font_size)
        """
        # 计算所有需要的指标
        bullet_count = len(content_list)
        if bullet_count == 0:
            return None, None
            
        # 计算内容相关指标
        total_words = sum(len(content.split()) for content in content_list)
        total_chars = sum(len(content) for content in content_list)
        avg_words_per_bullet = total_words / bullet_count
        avg_chars_per_bullet = total_chars / bullet_count
        
        # 计算标题相关指标
        title_word_count = len(title.split()) if title else 0
        title_length = len(title) if title else 0
        
        # 计算内容字体大小
        content_font_size = self._calculate_content_font_size(
            bullet_count, 
            avg_words_per_bullet,
            avg_chars_per_bullet
        )
        
        # 计算标题字体大小
        title_font_size = self._calculate_title_font_size(
            title_word_count,
            title_length
        )
        
        return content_font_size, title_font_size
    
    def _calculate_content_font_size(self, bullet_count, avg_words_per_bullet, avg_chars_per_bullet):
        """内部方法：计算内容字体大小"""
        # 如果平均字符数超过100，使用更小的字体
        if avg_chars_per_bullet > 100:
            return Pt(11)

        # 条件1: bullet point数在3个及以下，并且每个bullet point平均词数在15以下
        if bullet_count <= 3 and avg_words_per_bullet < 15:
            return Pt(14)
        
        # 条件2: bullet point数在4-5个，并且每个bullet point平均词数在10以下
        elif 4 <= bullet_count <= 5 and avg_words_per_bullet < 10:
            return Pt(14)
        
        # 如果平均词数超过15，使用更小的字体
        elif avg_words_per_bullet > 15:
            return Pt(12)
        
        # 其他情况使用中等字体
        else:
            return Pt(12)
    
    def _calculate_title_font_size(self, title_word_count, title_length):
        """内部方法：计算标题字体大小"""
        # 如果标题很长（超过10个字符），使用较小字体
        if title_length > 10:
            return Pt(20)
        # 如果标题超过6个词，使用中等字体
        elif title_word_count > 6:
            return Pt(22)
        # 如果标题超过4个词，使用较大字体
        elif title_word_count > 4:
            return Pt(24)
        # 4个词以下使用默认字体
        else:
            return None 