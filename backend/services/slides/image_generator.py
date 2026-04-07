# -*- coding: utf-8 -*-
"""Image search & AI Generation Module

This module provides image generation functionality using Google Image Search and AI generation.
It can be called by img_chart_processor to generate images based on prompts.
"""

import os
import tempfile
import asyncio
import random
from io import BytesIO
from PIL import Image
import requests
import time
import json

# ========== 1. Google 搜图功能 ==========

# === Google 搜图 ===
SERPAPI_KEY = "044337361b95bae23c4338e45310aa83698d577782d660d6d6b278e7e291512f"

def search_google_images(query, num_images=3):
    """使用 Google 搜索图片
    
    Args:
        query (str): 搜索查询
        num_images (int): 返回图片数量
        
    Returns:
        list: 图片URL列表
    """
    url = "https://serpapi.com/search"
    params = {
        "engine": "google",
        "q": query.strip(),
        "tbm": "isch",
        "hl": "en",
        "num": num_images,
        "api_key": SERPAPI_KEY
    }
    try:
        res = requests.get(url, params=params)
        data = res.json()
        images = []
        if "images_results" in data:
            for img in data["images_results"][:num_images]:
                images.append(img["original"])
        return images
    except Exception as e:
        print("[Google Image Error]", e)
        return []

# ========== 2. HDGSB AI 生图功能 ==========

class HDGSBImageGenerator:
    def __init__(self, api_key="sk-NqKNfPfPj8yQX6uRtJTVwLP7pX9BaKaPaMqhPHRKLHuuzRc1"):
        """
        初始化HDGSB图像生成器
        
        Args:
            api_key (str): API密钥
        """
        self.api_key = api_key
        self.base_url = "https://api.hdgsb.com/v1/images/generations"
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
    
    def generate_image(self, prompt, model="dall-e-3", size="1024x1024", n=1):
        """
        生成图像
        
        Args:
            prompt (str): 图像描述提示词
            model (str): 模型名称，默认 "dall-e-3"
            size (str): 图像尺寸，默认 "1024x1024"
            n (int): 生成图像数量，默认 1
            
        Returns:
            list: 生成的图像列表 (PIL.Image对象)
        """
        payload = json.dumps({
            "model": model,
            "prompt": prompt,
            "n": n,
            "size": size
        })
        
        try:
            print(f"🔄 Generating images: {prompt[:50]}...")
            response = requests.post(self.base_url, headers=self.headers, data=payload)
            
            if response.status_code == 200:
                # 处理返回的图像数据
                images = []
                
                # 如果返回的是JSON格式（包含图像URL）
                try:
                    response_data = response.json()
                    if 'data' in response_data:
                        for item in response_data['data']:
                            if 'url' in item:
                                # 下载图像
                                img_response = requests.get(item['url'])
                                if img_response.status_code == 200:
                                    img = Image.open(BytesIO(img_response.content))
                                    if img.mode != "RGB":
                                        img = img.convert("RGB")
                                    images.append(img)
                except json.JSONDecodeError:
                    # 如果返回的是直接的图像数据
                    img = Image.open(BytesIO(response.content))
                    if img.mode != "RGB":
                        img = img.convert("RGB")
                    images.append(img)
                
                print(f"✅ Successfully generated {len(images)} images")
                return images
            else:
                print(f"❌ Request failed: {response.status_code}")
                print(f"Error message: {response.text}")
                return []
                
        except Exception as e:
            print(f"❌ Error generating images: {e}")
            return []

# 创建全局的HDGSB图像生成器实例
hdgsb_generator = HDGSBImageGenerator()

def generate_ai_image(prompt, num_images=3):
    """使用 HDGSB AI 生成图片
    
    Args:
        prompt (str): 图片生成提示词
        num_images (int): 生成图片数量
        
    Returns:
        list: PIL Image 对象列表
    """
    return hdgsb_generator.generate_image(prompt, n=num_images)

# ========== 3. 主要图像生成函数（供 img_chart_processor 调用） ==========

def generate_image_from_prompt(prompt, output_dir=None, ratio=0, num_images=1):
    # 如果没有指定输出目录，使用默认路径
    if output_dir is None:
        current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        output_dir = os.path.join(current_dir, "static", "ppt_templates", "images")
    """根据提示词生成图片（供 img_chart_processor 调用）
    
    Args:
        prompt (str): 图片生成提示词
        output_dir (str): 输出目录
        ratio (int): 图片比例，0表示4:3，1表示16:9
        num_images (int): 生成图片数量
        
    Returns:
        str: 生成的图片文件路径，如果失败返回None
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    print(f"🎨 Generating image for prompt: {prompt[:100]}...")
    
    # 生成时间戳和随机数用于文件名
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    random_num = random.randint(1000, 9999)
    
    # 尝试生成AI图片
    ai_images = generate_ai_image(prompt, num_images=num_images)
    
    if ai_images:
        try:
            # 保存第一张AI生成的图片
            img_path = os.path.join(output_dir, f"generated_ai_{timestamp}_{random_num}.jpg")
            ai_images[0].save(img_path)
            print(f"✅ AI image saved: {img_path}")
            
            # 根据比例调整图片尺寸
            resized_path = resize_image_for_ratio(img_path, ratio)
            return resized_path
        except Exception as e:
            print(f"❌ Error saving AI image: {e}")
    
    # 如果AI生成失败，尝试Google搜索
    google_images = search_google_images(prompt, num_images=num_images)
    
    if google_images:
        try:
            img_data = requests.get(google_images[0]).content
            img_path = os.path.join(output_dir, f"generated_google_{timestamp}_{random_num}.jpg")
            with open(img_path, 'wb') as f:
                f.write(img_data)
            print(f"✅ Google image saved: {img_path}")
            
            # 根据比例调整图片尺寸
            resized_path = resize_image_for_ratio(img_path, ratio)
            return resized_path
        except Exception as e:
            print(f"❌ Error saving Google image: {e}")
    
    print("❌ Failed to generate image from both AI and Google search")
    return None

# ========== 3.1. 异步版本的图像生成函数 ==========

async def generate_image_from_prompt_async(prompt, output_dir=None, ratio=0, num_images=1):
    """异步版本的图像生成函数
    
    Args:
        prompt (str): 图片生成提示词
        output_dir (str): 输出目录
        ratio (int): 图片比例，0表示4:3，1表示16:9
        num_images (int): 生成图片数量
        
    Returns:
        str: 生成的图片文件路径，如果失败返回None
    """
    # 使用 asyncio.to_thread() 将同步函数包装为异步
    return await asyncio.to_thread(
        generate_image_from_prompt,
        prompt=prompt,
        output_dir=output_dir,
        ratio=ratio,
        num_images=num_images
    )

# ========== 4. 批量处理函数 ==========

def process_multiple_prompts(prompts, output_dir=None):
    # 如果没有指定输出目录，使用默认路径
    if output_dir is None:
        current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        output_dir = os.path.join(current_dir, "static", "ppt_templates", "images")
    """批量处理多个提示词
    
    Args:
        prompts (list): 提示词列表
        output_dir (str): 输出目录
        
    Returns:
        list: 生成的图片路径列表
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    results = []
    
    for i, prompt in enumerate(prompts):
        print(f"\n📄 Processing prompt {i+1}/{len(prompts)}: {prompt[:100]}...")
        
        # 生成图片
        image_path = generate_image_from_prompt(prompt, output_dir)
        
        if image_path:
            results.append({
                "prompt": prompt,
                "image_path": image_path,
                "success": True
            })
        else:
            results.append({
                "prompt": prompt,
                "image_path": None,
                "success": False
            })
    
    return results

# ========== 5. 辅助函数 ==========

def resize_image_for_ratio(image_path, ratio=0):
    """根据比例调整图片尺寸
    
    Args:
        image_path (str): 图片路径
        ratio (int): 比例，0表示4:3，1表示16:9
        
    Returns:
        str: 调整后的图片路径
    """
    try:
        with Image.open(image_path) as img:
            # 定义目标尺寸
            if ratio == 0:  # 4:3
                target_width, target_height = 800, 600
            else:  # 16:9
                target_width, target_height = 800, 450
            
            # 调整尺寸，保持宽高比
            img.thumbnail((target_width, target_height), Image.Resampling.LANCZOS)
            
            # 保存调整后的图片
            resized_path = image_path.replace('.jpg', '_resized.jpg')
            img.save(resized_path)
            
            return resized_path
    except Exception as e:
        print(f"❌ Error resizing image: {e}")
        return image_path

# ========== 6. 导入必要的模块 ==========
from datetime import datetime

# ========== 7. 测试函数 ==========

def test_image_generation():
    """测试图像生成功能"""
    test_prompt = ("A cute baby sea otter floating on its back in crystal clear water")
    
    print("🧪 Testing image generation...")
    result = generate_image_from_prompt(test_prompt)
    
    if result:
        print(f"✅ Test successful! Generated image: {result}")
    else:
        print("❌ Test failed!")

if __name__ == "__main__":
    test_image_generation()