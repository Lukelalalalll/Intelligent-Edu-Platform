"""Business模板副标题生成器

专门处理Business模板中副标题生成的逻辑，包括：
- 跳过词文件加载
- 副标题内容生成算法
- 词汇过滤和处理
"""


class BusinessSubtitleGenerator:
    """Business模板副标题生成器"""
    
    def __init__(self, skip_words_file='text/skip_words.txt'):
        """初始化副标题生成器
        
        Args:
            skip_words_file (str): 跳过词文件路径
        """
        self.skip_words_file = skip_words_file
        self._skip_words_cache = None
    
    def generate_subtitle_content(self, index, content):
        """生成副标题内容
        
        Args:
            index (int): 内容索引（从1开始）
            content (str): 正文内容
            
        Returns:
            str: 副标题内容
        """
        # 从文件中读取需要跳过的词列表
        skip_words = self._load_skip_words()
        
        # 分割内容为单词
        words = content.strip().split()
        
        if not words:
            return f"{index}. Empty"
        
        # 生成副标题内容
        subtitle_words = self._extract_subtitle_words(words, skip_words)
        
        # 组合副标题内容：索引 + 单词
        subtitle = f"{index}. {' '.join(subtitle_words)}"
        
        return subtitle
    
    def _extract_subtitle_words(self, words, skip_words):
        """提取副标题使用的词汇
        
        Args:
            words (list): 原始词汇列表
            skip_words (list): 跳过词列表
            
        Returns:
            list: 用于副标题的词汇列表
        """
        subtitle_words = []
        
        # 如果第一个词是跳过词，循环迭代直到找到第一个非跳过词
        if words[0].lower() in [w.lower() for w in skip_words]:
            # 收集所有连续的跳过词
            skip_words_sequence = []
            non_skip_word = None
            
            for word in words:
                if word.lower() in [w.lower() for w in skip_words]:
                    skip_words_sequence.append(word)
                else:
                    non_skip_word = word
                    break
            
            # 如果找到了非跳过词，将其和所有跳过词都加入
            if non_skip_word:
                subtitle_words = skip_words_sequence + [non_skip_word]
            else:
                # 如果所有词都是跳过词，使用前两个词
                subtitle_words = words[:2] if len(words) >= 2 else words[:1]
        else:
            # 如果第一个词不是跳过词，只使用第一个词
            subtitle_words = words[:1]
        
        return subtitle_words
    
    def _load_skip_words(self):
        """从skip_words.txt文件中加载需要跳过的词列表
        
        Returns:
            list: 需要跳过的词列表
        """
        if self._skip_words_cache is not None:
            return self._skip_words_cache
        
        skip_words = []
        
        try:
            with open(self.skip_words_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    # 跳过空行和注释行
                    if line and not line.startswith('#'):
                        skip_words.append(line)
        except FileNotFoundError:
            print(f"Warning: Skip words file '{self.skip_words_file}' not found")
        except Exception as e:
            print(f"Error loading skip words file: {e}")
        
        # 缓存结果
        self._skip_words_cache = skip_words
        return skip_words
    
    def reload_skip_words(self):
        """重新加载跳过词列表"""
        self._skip_words_cache = None
        return self._load_skip_words()
    
    def add_skip_word(self, word):
        """添加跳过词到缓存
        
        Args:
            word (str): 要添加的跳过词
        """
        skip_words = self._load_skip_words()
        if word not in skip_words:
            skip_words.append(word)
    
    def remove_skip_word(self, word):
        """从缓存中移除跳过词
        
        Args:
            word (str): 要移除的跳过词
        """
        skip_words = self._load_skip_words()
        if word in skip_words:
            skip_words.remove(word) 