"""
Business PPT 图片处理器

这个模块负责处理Business PPT模板中的图片占位符，包括：
- 图片占位符识别
- 图片生成请求
- 图片插入逻辑
- 异步并行处理支持
- 收集-批量处理-应用模式
"""

import asyncio
from ..img_chart_processor import ImageChartProcessor

class BusinessImageProcessor:
    """Business PPT专用图片处理器"""
    
    PLACEHOLDER_IMAGE = 18  # 图片占位符类型
    PLACEHOLDER_OBJECT = 7  # 对象占位符类型
    
    def __init__(self):
        self.image_processor = ImageChartProcessor()
        
        # 新增：收集队列相关属性
        self.collected_tasks = []  # 收集的任务队列
        self.is_collecting = False  # 是否正在收集模式
        self.batch_results = []  # 批量处理结果
        
    def start_collecting(self):
        """开始收集模式"""
        self.collected_tasks = []
        self.is_collecting = True
        self.batch_results = []
        print("🔄 [Batch Processing] Started collecting image placeholder tasks...")
        
    def stop_collecting(self):
        """停止收集模式"""
        self.is_collecting = False
        print(f"⏹️ [Batch Processing] Stopped collecting. Total collected tasks: {len(self.collected_tasks)}")
        
    async def process_image_placeholders(self, slide, slide_data):
        """处理图片和对象占位符
        
        在收集模式下：收集任务信息，不立即执行
        在正常模式下：立即执行异步处理
        
        Args:
            slide: 幻灯片对象
            slide_data (dict): 幻灯片数据
        """
        slide_title = slide_data.get('title', 'Unknown')
        
        # 获取布局信息和内容数量（用于判断是否处理占位符）
        layout = getattr(slide, 'custom_layout', None) or getattr(slide, 'slide_layout', None)
        content_count = len(slide_data.get('content', []))
        
        # 📊 收集阶段：收集所有需要处理的占位符信息
        placeholder_infos = []
        
        for shape in slide.shapes:
            if not shape.is_placeholder:
                continue
                
            placeholder_type = shape.placeholder_format.type
            
            # 检查是否是图片或对象占位符
            if placeholder_type in [self.PLACEHOLDER_IMAGE, self.PLACEHOLDER_OBJECT]:
                # 应用业务规则：根据布局和内容数量判断是否应该处理此占位符
                if not self.should_process_placeholder(layout, content_count, placeholder_type):
                    print(f"⏭️ [Image Processing] Skipping placeholder type {placeholder_type} due to business rules (content_count={content_count})")
                    continue
                
                # 收集占位符信息
                placeholder_info = self._collect_placeholder_info(shape, placeholder_type)
                if placeholder_info:
                    placeholder_infos.append(placeholder_info)
        
        if not placeholder_infos:
            print(f"📝 [Image Processing] No image placeholders found in slide: {slide_title}")
            return
            
        print(f"🔍 [Image Processing] Found {len(placeholder_infos)} placeholders in slide: {slide_title}")
        
        # 根据是否在收集模式决定处理方式
        if self.is_collecting:
            # 收集模式：将任务加入队列
            task_info = {
                'slide': slide,
                'slide_data': slide_data,
                'placeholder_infos': placeholder_infos,
                'slide_title': slide_title
            }
            self.collected_tasks.append(task_info)
            print(f"📦 [Batch Processing] Collected task for slide: {slide_title} ({len(placeholder_infos)} placeholders)")
        else:
            # 正常模式：立即处理
            await self._process_single_slide_placeholders(slide, slide_data, placeholder_infos)
            
    async def _process_single_slide_placeholders(self, slide, slide_data, placeholder_infos):
        """处理单个幻灯片的占位符（立即执行模式）"""
        slide_title = slide_data.get('title', 'Unknown')
        
        # 准备图片数据
        image_data_list = []
        for i, placeholder_info in enumerate(placeholder_infos):
            image_data = self._prepare_image_data(slide_data, placeholder_info, i)
            image_data_list.append(image_data)
        
        # 🚀 批量异步处理：并行调用LLM
        print(f"🚀 [Image Processing] Processing {len(placeholder_infos)} placeholders in parallel for slide: {slide_title}")
        image_paths = await self.image_processor.process_multiple_images_async(image_data_list)
        
        # 📌 结果应用：将图片路径应用到对应占位符
        for i, (placeholder_info, image_path) in enumerate(zip(placeholder_infos, image_paths)):
            try:
                if image_path:
                    self._insert_picture_into_placeholder(slide, placeholder_info['shape'], image_path)
                    print(f"✅ [Image Processing] Applied image {i+1}/{len(image_paths)} to placeholder successfully")
                else:
                    print(f"⚠️ [Image Processing] No image generated for placeholder {i+1}")
            except Exception as e:
                print(f"❌ [Image Processing] Error applying image {i+1} to placeholder: {e}")
        
        print(f"🎉 [Image Processing] Completed processing {len(placeholder_infos)} placeholders for slide: {slide_title}")

    async def process_all_collected_tasks(self):
        """批量处理所有收集的任务"""
        if not self.collected_tasks:
            print("ℹ️ [Batch Processing] No collected tasks to process")
            return
            
        print(f"🚀 [Batch Processing] Starting batch processing of {len(self.collected_tasks)} collected tasks...")
        
        # 准备所有图片数据
        all_image_data = []
        task_mappings = []  # 用于映射结果回对应的任务和占位符
        
        for task_idx, task_info in enumerate(self.collected_tasks):
            slide_data = task_info['slide_data']
            placeholder_infos = task_info['placeholder_infos']
            slide_title = task_info['slide_title']
            
            # 为每个任务的每个占位符创建图片数据
            for placeholder_idx, placeholder_info in enumerate(placeholder_infos):
                image_data = self._prepare_image_data(slide_data, placeholder_info, placeholder_idx)
                all_image_data.append(image_data)
                
                # 记录映射关系
                task_mappings.append({
                    'task_idx': task_idx,
                    'placeholder_idx': placeholder_idx,
                    'slide_title': slide_title
                })
        
        # 批量并行处理所有图片数据
        total_count = len(all_image_data)
        print(f"⚡ [Batch Processing] Processing {total_count} image placeholders in parallel...")
        
        self.batch_results = await self.image_processor.process_multiple_images_async(all_image_data)
        
        print(f"✅ [Batch Processing] Batch processing completed! Generated {len(self.batch_results)} images")
        
        # 应用结果到对应的占位符
        await self._apply_batch_results(task_mappings)
        
    async def _apply_batch_results(self, task_mappings):
        """应用批量处理结果到对应的占位符"""
        print(f"📌 [Batch Processing] Applying {len(self.batch_results)} results to placeholders...")
        
        applied_count = 0
        error_count = 0
        
        for result_idx, (image_path, mapping) in enumerate(zip(self.batch_results, task_mappings)):
            try:
                task_info = self.collected_tasks[mapping['task_idx']]
                slide = task_info['slide']
                placeholder_info = task_info['placeholder_infos'][mapping['placeholder_idx']]
                slide_title = mapping['slide_title']
                
                if image_path:
                    self._insert_picture_into_placeholder(slide, placeholder_info['shape'], image_path)
                    applied_count += 1
                    print(f"✅ [Batch Processing] Applied result {result_idx+1}/{len(self.batch_results)} to slide: {slide_title}")
                else:
                    print(f"⚠️ [Batch Processing] No image generated for result {result_idx+1} in slide: {slide_title}")
                    
            except Exception as e:
                error_count += 1
                print(f"❌ [Batch Processing] Error applying result {result_idx+1}: {e}")
        
        print(f"🎉 [Batch Processing] Batch application completed! Applied: {applied_count}, Errors: {error_count}")
        
    def _collect_placeholder_info(self, shape, placeholder_type):
        """收集单个占位符的信息
        
        Args:
            shape: PPT形状对象
            placeholder_type (int): 占位符类型
            
        Returns:
            dict or None: 占位符信息字典，如果不支持则返回None
        """
        aspect_ratio = shape.width / shape.height
        ratio = self._get_ratio_by_aspect(aspect_ratio)
        
        if ratio is None:
            print(f"⚠️ [Image Processing] Unsupported aspect ratio {aspect_ratio:.3f} for placeholder type {placeholder_type}")
            return None
        
        placeholder_info = {
            'shape': shape,                    # PPT形状对象
            'left': shape.left,               # 位置信息
            'top': shape.top,
            'width': shape.width,
            'height': shape.height,
            'placeholder_type': placeholder_type,  # 18=图片, 7=对象
            'aspect_ratio': aspect_ratio,     # 宽高比
            'ratio': ratio,                   # 0=4:3, 1=16:9
            'image_type': self.get_image_type_by_placeholder(placeholder_type)  # 'image' 或 'diagram'
        }
        
        return placeholder_info
    
    def _prepare_image_data(self, slide_data, placeholder_info, placeholder_index):
        """准备单个占位符的图片数据
        
        Args:
            slide_data (dict): 幻灯片数据
            placeholder_info (dict): 占位符信息
            placeholder_index (int): 占位符索引（用于结果映射）
            
        Returns:
            dict: 图片数据字典
        """
        title = slide_data.get('title', '')
        content_list = slide_data.get('content', [])
        chart_type = slide_data.get('chart_type', '')
        chart_reasoning = slide_data.get('chart_reasoning', '')
        original_text = slide_data.get('original_text', '')
        
        image_data = {
            'title': title,
            'content_list': content_list,
            'ratio': placeholder_info['ratio'],
            'type': placeholder_info['image_type'],
            'chart_type': chart_type,
            'chart_reasoning': chart_reasoning,
            'original_text': original_text,
            'placeholder_type': placeholder_info['placeholder_type'],  # 占位符类型信息
            'placeholder_index': placeholder_index,                    # 用于结果映射
            'aspect_ratio': placeholder_info['aspect_ratio']           # 宽高比信息
        }
        
        return image_data
    
    def _get_ratio_by_aspect(self, aspect_ratio):
        """根据宽高比判断比例类型"""
        # 16:9 的宽高比约为 1.778，4:3 约为 1.333
        if abs(aspect_ratio - 1.778) < 0.1:
            return 1  # 16:9
        elif abs(aspect_ratio - 1.333) < 0.1:
            return 0  # 4:3
        else:
            return None  # 不支持的比例
    
    def get_image_type_by_placeholder(self, placeholder_type):
        """根据占位符类型确定图片类型"""
        if placeholder_type == self.PLACEHOLDER_IMAGE:
            return 'image'
        elif placeholder_type == self.PLACEHOLDER_OBJECT:
            return 'diagram'
        else:
            return 'image'  # 默认类型
    
    def _insert_picture_into_placeholder(self, slide, placeholder, image_path):
        """将图片插入到占位符中
        
        Args:
            slide: 幻灯片对象
            placeholder: 占位符对象
            image_path (str): 图片文件路径
        """
        try:
            # 🎯 直接在占位符中插入图片，保持层次顺序
            placeholder.insert_picture(image_path)
            print(f"✅ [Insert Picture] Successfully inserted image into placeholder: {image_path}")
        except Exception as e:
            print(f"⚠️ [Insert Picture] insert_picture failed, falling back to add_picture: {e}")
            # 如果插入失败，回退到原来的方法
            left = placeholder.left
            top = placeholder.top
            width = placeholder.width
            height = placeholder.height
            slide.shapes.add_picture(image_path, left, top, width, height)
    
    def should_process_placeholder(self, layout, content_count, placeholder_type):
        """判断是否应该处理特定的占位符（动态布局规则）
        
        Args:
            layout: 布局对象
            content_count (int): 内容数量
            placeholder_type (int): 占位符类型
            
        Returns:
            bool: 是否应该处理
        """
        # 如果没有布局信息，默认处理
        if not layout:
            return True
            
        # 检查是否为特殊动态布局
        layout_name = getattr(layout, 'name', '')
        is_special_layout = layout_name in ['Icon with Text_dynamic', 'Rectangular Style_dynamic']
        
        if is_special_layout:
            # 特殊布局的规则
            if content_count <= 3:
                # 1-3个内容时，处理所有类型的占位符
                return True
            elif content_count in [4, 5]:
                # 4-5个内容时，只处理对象占位符（type=7）
                return placeholder_type == self.PLACEHOLDER_OBJECT
            else:
                # 6个以上内容时，不处理任何图片/对象占位符
                return False
        else:
            # 普通布局处理所有类型
            return True 