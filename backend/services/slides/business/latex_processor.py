"""Business模板LaTeX处理器

专门处理Business模板中LaTeX公式的处理逻辑，包括：
- LaTeX公式检测和生成
- 占位符分配和图片插入
- 与Business模板架构的集成
"""

from PIL import Image
from ..generation.latex_generator import process_slide_latex


class BusinessLatexProcessor:
    """Business模板LaTeX处理器"""
    
    def __init__(self):
        """初始化LaTeX处理器"""
        pass
    
    def process_latex_formulas(self, slide, slide_data, placeholder_processor):
        """处理Business模板的LaTeX公式
        
        Args:
            slide: 幻灯片对象
            slide_data (dict): 幻灯片数据
            placeholder_processor: Business占位符处理器实例
        """
        # 检查是否有latex字段且包含公式
        latex_formulas = slide_data.get('latex', [])
        
        if not latex_formulas or not any(formula.strip() for formula in latex_formulas):
            return  # 没有LaTeX公式，直接返回
        
        # 生成幻灯片ID
        slide_id = f"business_slide_{slide_data.get('slide_number', 'unknown')}"
        
        # 处理LaTeX公式，生成图像
        formula_images = process_slide_latex(slide_data, slide_id)
        
        if not formula_images:
            print(f"⚠️ PPT {slide_id} LaTeX formulas processing failed")
            return
            
        print(f"✅ PPT {slide_id} successfully processed {len(formula_images)} formulas")
        
        # 插入公式图片到占位符
        self._insert_latex_images(slide, formula_images, placeholder_processor)
    
    def _insert_latex_images(self, slide, formula_images, placeholder_processor):
        """将LaTeX公式图像插入到Business模板幻灯片中
        
        Args:
            slide: 幻灯片对象
            formula_images (dict): 公式到图像路径的映射
            placeholder_processor: Business占位符处理器实例
        """
        # 使用Business模板的占位符处理器收集其他类型的占位符（参考表格处理逻辑）
        other_placeholders = placeholder_processor.collect_other_placeholders(slide)
        
        # 为每个公式图像分配一个占位符
        for i, (formula, image_path) in enumerate(formula_images.items()):
            if i < len(other_placeholders):
                placeholder_info = other_placeholders[i]
                try:
                    # 插入图片到占位符
                    self._insert_picture_into_placeholder(
                        slide, 
                        placeholder_info['shape'], 
                        image_path,
                        placeholder_info['left'],
                        placeholder_info['top'],
                        placeholder_info['width'],
                        placeholder_info['height']
                    )
                    print(f"✅ Formula image inserted into the slide: {formula[:50]}...")
                except Exception as e:
                    print(f"❌ Formula image failed to insert into the slide: {e}")
            else:
                print(f"⚠️ No enough placeholders to insert formula: {formula[:50]}...")
    
    def _insert_picture_into_placeholder(self, slide, placeholder_shape, image_path, left, top, width, height):
        """将图片插入到占位符中，根据原始宽高比计算高度
        
        Args:
            slide: 幻灯片对象
            placeholder_shape: 占位符形状对象
            image_path (str): 图片文件路径
            left: 左边距
            top: 上边距
            width: 目标宽度
            height: 占位符高度（将被忽略，根据宽高比计算）
        """
        try:
            # 获取图片的原始尺寸
            with Image.open(image_path) as img:
                original_width, original_height = img.size
                
            # 计算宽高比
            aspect_ratio = original_height / original_width
            
            # 根据目标宽度和原始宽高比计算新的高度
            calculated_height = int(width * aspect_ratio)
            
            print(f"📏 Image dimensions - Original: {original_width}x{original_height}, "
                  f"Target: {width}x{calculated_height} (aspect ratio: {aspect_ratio:.3f})")
            
            # 添加图片到指定位置，使用计算出的高度
            slide.shapes.add_picture(image_path, left, top, width, calculated_height)
            
        except Exception as e:
            print(f"❌ Failed to get image dimensions, using original height: {e}")
            # 如果获取图片尺寸失败，回退到使用原始height参数
            slide.shapes.add_picture(image_path, left, top, width, height) 