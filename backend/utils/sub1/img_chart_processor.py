import os
import asyncio
import aiohttp
import json
from datetime import datetime
# 导入图像生成模块
from .image_generator import generate_image_from_prompt, generate_image_from_prompt_async
# 导入图表生成模块
from .diagram_generator import generate_diagram_from_prompt_async

class ImageChartProcessor:
    def __init__(self, deepseek_base_url="https://api.deepseek.com/v1"):
        """初始化图片图表处理器
        
        Args:
            deepseek_api_key (str, optional): DeepSeek API密钥，用于生成增强的图片提示词
            deepseek_base_url (str): DeepSeek API基础URL
        """
        # 使用绝对路径确保路径正确
        current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.base_path = os.path.join(current_dir, "static", "ppt_templates", "images")
        self.diagram_path = os.path.join(current_dir, "static", "ppt_templates", "diagrams")
        self.prompt_save_dir = "chart_prompts"
        # 确保提示词保存目录存在
        os.makedirs(self.prompt_save_dir, exist_ok=True)
        
        # DeepSeek API配置（用于图片提示词增强）
        self.deepseek_api_key = "sk-f2b923f129634f49ac37c3d675595acf"
        self.deepseek_base_url = deepseek_base_url
    
    async def process_multiple_images_async(self, image_data_list):
        """异步并行处理多个图片（两阶段处理）
        
        Args:
            image_data_list (list): 包含多个图片数据的列表
            
        Returns:
            list: 处理后的图片路径列表
        """
        if not image_data_list:
            return []
        
        print(f"🚀 Processing {len(image_data_list)} images in parallel...")
        
        # 阶段1：异步生成所有图片提示词
        print("📝 Stage 1: Generating prompts with DeepSeek API...")
        # enhanced_image_data_list = await self._generate_all_prompts_async(image_data_list)
        
        # 阶段2：异步生成所有图片
        print("🎨 Stage 2: Generating images...")
        image_paths = await self._generate_all_images_async(image_data_list)
        
        print(f"✅ Completed processing {len(image_paths)} images")
        return image_paths
        
    async def _generate_all_prompts_async(self, image_data_list):
        """阶段1：异步生成所有图片提示词
        
        Args:
            image_data_list (list): 图片数据列表
            
        Returns:
            list: 增强后的图片数据列表（包含生成的提示词）
        """
        # 只对image类型的数据调用DeepSeek API
        image_tasks = []
        chart_data = []
        
        for i, image_data in enumerate(image_data_list):
            if image_data.get('type') == 'image':
                # image类型：异步调用DeepSeek API生成提示词
                task = self._generate_image_prompt_with_deepseek_async(image_data, i)
                image_tasks.append(task)
            else:
                # chart类型：直接使用chart_reasoning中的完整提示词
                enhanced_data = image_data.copy()
                chart_reasoning = image_data.get('chart_reasoning', [])
                
                if chart_reasoning and len(chart_reasoning) > 0:
                    chart_prompt = chart_reasoning[0]  # 直接使用chart_reasoning中的完整prompt
                    enhanced_data['enhanced_prompt'] = chart_prompt
                    
                    # 保存chart提示词到本地文件
                    self._save_prompt_to_file(chart_prompt, image_data, prompt_type='chart')
                else:
                    # 如果没有chart_reasoning，设置默认值
                    enhanced_data['enhanced_prompt'] = "No chart reasoning provided"
                
                chart_data.append(enhanced_data)
        
        # 并行处理所有image类型的提示词生成
        if image_tasks:
            enhanced_image_data = await asyncio.gather(*image_tasks)
        else:
            enhanced_image_data = []
        
        # 合并所有数据
        all_enhanced_data = enhanced_image_data + chart_data
        
        # 按原始顺序排序
        ordered_data = []
        image_idx = 0
        chart_idx = 0
        
        for image_data in image_data_list:
            if image_data.get('type') == 'image':
                ordered_data.append(enhanced_image_data[image_idx])
                image_idx += 1
            else:
                ordered_data.append(chart_data[chart_idx])
                chart_idx += 1
        
        return ordered_data
    
    async def _generate_all_images_async(self, enhanced_image_data_list):
        """阶段2：异步生成所有图片
        
        Args:
            enhanced_image_data_list (list): 包含增强提示词的图片数据列表
            
        Returns:
            list: 图片路径列表
        """
        # 创建异步任务列表
        tasks = []
        for i, image_data in enumerate(enhanced_image_data_list):
            task = self._generate_single_image_async(image_data, i)
            tasks.append(task)
        
        # 并行执行所有图片生成任务
        image_paths = await asyncio.gather(*tasks)
        
        return image_paths
    
    async def _generate_image_prompt_with_deepseek_async(self, image_data, index):
        """使用DeepSeek API异步生成图片提示词
        
        Args:
            image_data (dict): 图片数据
            index (int): 图片索引
            
        Returns:
            dict: 增强后的图片数据（包含生成的提示词）
        """
        print(f"🤖 Generating prompt for image {index + 1}: {image_data.get('title', 'Unknown')}")
        
        try:
            # 调用DeepSeek API生成提示词
            enhanced_prompt = await self._call_deepseek_api(image_data)
            
            # 创建增强后的数据
            enhanced_data = image_data.copy()
            enhanced_data['enhanced_prompt'] = enhanced_prompt
            
            # 保存生成的提示词到本地文件
            self._save_prompt_to_file(enhanced_prompt, image_data, prompt_type='image_enhanced')
            
            print(f"✅ Enhanced prompt generated for image {index + 1}")
            return enhanced_data
            
        except Exception as e:
            print(f"❌ Failed to generate enhanced prompt for image {index + 1}: {e}")
            # 失败时使用本地生成的简单提示词
            fallback_prompt = self._generate_image_prompt(image_data)
            enhanced_data = image_data.copy()
            enhanced_data['enhanced_prompt'] = fallback_prompt
            return enhanced_data
    
    async def _generate_single_image_async(self, image_data, index):
        """使用增强提示词异步生成单个图片
        
        Args:
            image_data (dict): 包含增强提示词的图片数据
            index (int): 图片索引
            
        Returns:
            str: 图片文件路径
        """
        print(f"🎨 Generating image {index + 1}: {image_data.get('title', 'Unknown')}")
        
        enhanced_prompt = image_data.get('enhanced_prompt', '')
        image_type = image_data.get('type', 'image')
        
        # ============ 根据类型调用不同的生成函数 ============
        try:
            if image_type == 'image':
                # 调用图片生成函数（使用异步版本）
                '''
                image_path = await generate_image_from_prompt_async(
                    prompt=enhanced_prompt,
                    output_dir=self.base_path,
                    ratio=image_data.get('ratio', 0),
                    num_images=1
                )
                
                # 如果图片生成成功，返回生成的图片路径
                if image_path and os.path.exists(image_path):
                    print(f"✅ Image {index + 1} generated successfully: {image_path}")
                    return image_path
                else:
                    print(f"⚠️ Image generation failed for {index + 1}, using default image")
                    '''
                return self._get_default_image_path(image_data)
                    
            elif image_type == 'diagram':
                # ============ 调用图表生成函数 ============
                # 调用图表生成函数（使用异步版本）
                '''
                chart_image_path = await generate_diagram_from_prompt_async(
                    prompt=enhanced_prompt,
                    output_dir=self.diagram_path,
                    ratio=image_data.get('ratio', 0),
                    num_images=1,
                    chart_type=image_data.get('chart_type', '')  # 传入chart_type参数
                )
                
                # 如果图表生成成功，返回生成的图表路径
                if chart_image_path and os.path.exists(chart_image_path):
                    print(f"✅ Chart {index + 1} generated successfully: {chart_image_path}")
                    return chart_image_path
                else:
                    print(f"⚠️ Chart generation failed for {index + 1}, using default image")
                    return self._get_default_image_path(image_data)
                # =========================================================
            else:
                print(f"⚠️ Unknown image type '{image_type}' for {index + 1}, using default image")
                '''
                return self._get_default_image_path(image_data)
                
        except Exception as e:
            print(f"❌ Error generating image {index + 1}: {e}")
            return self._get_default_image_path(image_data)
        # =========================================================
    
    async def _call_deepseek_api(self, image_data):
        """调用DeepSeek API生成增强的图片提示词
        
        Args:
            image_data (dict): 图片数据
            
        Returns:
            str: 增强的图片提示词
        """
        if not self.deepseek_api_key:
            # 如果没有API密钥，返回本地生成的提示词
            return self._generate_image_prompt(image_data)
        
        title = image_data.get('title', '')
        content_list = image_data.get('content_list', [])
        original_text = image_data.get('original_text', '')
        ratio = '16:9' if image_data.get('ratio', 0) == 1 else '4:3'
        
        # 构建发送给DeepSeek的提示词
        system_prompt = """You are an expert image prompt engineer for text-to-image models. Your task is to create concise, descriptive prompts that focus on a core entity with related symbolic elements.

OUTPUT FORMAT:
Generate ONE descriptive sentence following this structure:
"A [conceptual/technical] illustration of [CORE ENTITY] as the main focus, with [2-3 SYMBOLIC ELEMENTS] emphasizing its key aspects. Rendered in [STYLE] with [QUALITY]. The image must be completely text-free, containing only visual elements and symbols without any words, labels, numbers, or written content."

KEY PRINCIPLES:
- Start with ONE core entity as the main focus
- Add 2-3 symbolic elements that directly relate to and emphasize the core entity
- Use concrete, visual terms rather than abstract concepts
- Keep the description concise and actionable
- Focus on visual elements that can be clearly represented
- CRITICAL: The final image must contain NO TEXT, NO LABELS, NO WORDS - only visual elements and symbols"""

        user_prompt = f"""SLIDE CONTENT:
Title: {title}
Content: {self._format_content_list(content_list)}
Context: {original_text[:800] if original_text else 'General business/academic presentation'}

PROCESS:
1. Identify the ONE most important visual entity from the content
2. Find 2-3 symbolic elements that directly relate to and emphasize this core entity from content or context
3. Choose appropriate style and quality terms

  EXAMPLE FORMAT:
  "A conceptual illustration of the Transformer architecture as the core entity, around it, several symbolic elements emphasize its key components: (1) a stream of tokenized input text flowing into the encoder, (2) multi-head attention mechanisms surrounding the core, (3) a beam connecting encoder and decoder layers. Rendered in a high-tech sci-fi art style with bluish-purple tones and cinematic lighting. The image must be completely text-free, containing only visual elements and symbols without any words, labels, numbers, or written content."

  BANNED: framework, regulation, directive, alignment, compliance, management, strategy, process
  AVOID: world map, offices, people, backgrounds, environments
  FORBIDDEN: Any text, labels, words, letters, numbers, or written content in the final image

Generate ONE descriptive sentence:"""

        # 构建API请求
        payload = {
            "model": "deepseek-chat",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "max_tokens": 500,
            "temperature": 0
        }
        
        headers = {
            "Authorization": f"Bearer {self.deepseek_api_key}",
            "Content-Type": "application/json"
        }
        
        timeout = aiohttp.ClientTimeout(total=30)  # 30秒超时
        
        async with aiohttp.ClientSession(timeout=timeout) as session:
            try:
                async with session.post(
                    f"{self.deepseek_base_url}/chat/completions",
                    json=payload,
                    headers=headers
                ) as response:
                    if response.status == 200:
                        result = await response.json()
                        content = result['choices'][0]['message']['content'].strip()
                        
                        # 直接使用返回的自然语言描述
                        # 清理可能的markdown格式标记
                        if content.startswith('```'):
                            # 移除可能的代码块标记
                            lines = content.split('\n')
                            if lines[0].startswith('```'):
                                lines = lines[1:]
                            if lines and lines[-1].strip() == '```':
                                lines = lines[:-1]
                            content = '\n'.join(lines).strip()
                        
                        print(f"✅ Generated enhanced prompt via DeepSeek API")
                        return content
                    else:
                        error_text = await response.text()
                        raise Exception(f"API request failed with status {response.status}: {error_text}")
                        
            except asyncio.TimeoutError:
                raise Exception("DeepSeek API request timed out")
            except Exception as e:
                raise Exception(f"DeepSeek API call failed: {str(e)}")


    def _generate_image_prompt(self, image_data):
        """生成精简的图片提示词
        
        Args:
            image_data (dict): 图片数据
            
        Returns:
            str: 精简的图片生成提示词
        """
        title = image_data.get('title', '')
        content_list = image_data.get('content_list', [])
        ratio = '16:9' if image_data.get('ratio', 0) == 1 else '4:3'
        
        # 精简的图片提示词
        prompt = f"""Create a professional image for: "{title}"

Content Points:
{self._format_content_list(content_list)}

Requirements:
- {ratio} aspect ratio
- Professional, clean style suitable for presentations
- Relevant to the slide content and visually appealing"""
        
        return prompt.strip()
    

    def _format_content_list(self, content_list):
        """格式化内容列表
        
        Args:
            content_list (list): 内容列表
            
        Returns:
            str: 格式化后的内容
        """
        if not content_list:
            return "No content provided"
        
        formatted_content = []
        for i, content in enumerate(content_list, 1):
            formatted_content.append(f"{i}. {content}")
        
        return "\n".join(formatted_content)
    


    def _get_default_image_path(self, image_data):
        """获取默认图片路径
        
        Args:
            image_data (dict): 图片数据
            
        Returns:
            str: 默认图片路径
        """
        # 根据比例确定文件名后缀
        ratio_suffix = "16-9" if image_data.get('ratio', 0) == 1 else "4-3"
        
        # 根据类型确定文件名前缀和路径
        image_type = image_data.get('type', 'image')
        if image_type == 'diagram':
            type_prefix = "obj"
            base_path = self.diagram_path
        else:
            type_prefix = "pic"
            base_path = self.base_path
        
        # 构建文件名
        filename = f"{type_prefix}_{ratio_suffix}.png"
        
        # 返回完整路径
        return os.path.join(base_path, filename)
    

    def _save_prompt_to_file(self, prompt, image_data, prompt_type):
        """保存提示词到本地文件
        
        Args:
            prompt (str): 生成的提示词
            image_data (dict): 图片数据
            prompt_type (str): 'image' 或 'chart'
        """
        try:
            # 生成文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            title = image_data.get('title', 'untitled')
            
            # 根据prompt_type确定标识
            if prompt_type == 'image':
                type_identifier = 'Image'
            elif prompt_type == 'image_enhanced':
                type_identifier = 'Image_Enhanced'
            elif prompt_type == 'chart':
                chart_type = image_data.get('chart_type', 'unknown')
                type_identifier = chart_type.replace(' ', '_').replace('/', '_')
            else:
                type_identifier = 'Unknown'
            
            # 清理文件名，移除特殊字符
            safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()
            safe_title = safe_title.replace(' ', '_')[:50]  # 限制长度
            
            # 构建文件名
            filename = f"{timestamp}_{type_identifier}_{safe_title}.txt"
            filepath = os.path.join(self.prompt_save_dir, filename)
            
            # 保存文件，只保存prompt内容
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(prompt)
            
            print(f"✅ {prompt_type} prompt saved to: {filepath}")
            
        except Exception as e:
            print(f"❌ Failed to save {prompt_type} prompt: {e}")