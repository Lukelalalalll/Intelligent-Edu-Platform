import matplotlib.pyplot as plt
import matplotlib
import cv2
import numpy as np
import re
import os
import tempfile
from typing import List, Dict, Optional

# 设置matplotlib使用LaTeX渲染
matplotlib.rcParams['text.usetex'] = False  # 如果没有LaTeX环境，设为False
matplotlib.rcParams['font.size'] = 16

class LatexProcessor:
    """LaTeX公式处理器
    
    用于处理LaTeX公式列表，生成对应的图像文件
    """
    
    def __init__(self, output_dir: str = "md/latex"):
        """初始化LaTeX处理器
        
        Args:
            output_dir (str): 输出目录，用于存储生成的公式图像
        """
        self.output_dir = output_dir
        self.cropper = CropByProject()
        
        # 确保输出目录存在
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
    
    def remove_tag_from_latex(self, formula: str) -> str:
        """去除LaTeX公式中的\tag{...}标签
        
        Args:
            formula (str): 原始LaTeX公式
            
        Returns:
            str: 去除\tag{...}后的公式
        """
        # 使用正则表达式匹配并删除\tag{...}
        # 支持嵌套大括号的情况
        pattern = r'\\tag\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
        cleaned_formula = re.sub(pattern, '', formula)
        
        # 清理多余的空格
        cleaned_formula = re.sub(r'\s+', ' ', cleaned_formula).strip()
        
        return cleaned_formula
    
    def process_formula(self, formula: str, formula_id: str) -> Optional[str]:
        """处理单个LaTeX公式，生成图像文件
        
        Args:
            formula (str): LaTeX公式内容
            formula_id (str): 公式标识符，用于生成文件名
            
        Returns:
            Optional[str]: 生成的图像文件路径，如果失败则返回None
        """
        try:
            # 去除\tag{...}标签
            cleaned_formula = self.remove_tag_from_latex(formula)
            
            # 为公式添加数学模式标记
            if not cleaned_formula.startswith('$'):
                cleaned_formula = f'${cleaned_formula}$'
            
            # 创建图形
            fig, ax = plt.subplots(figsize=(8, 2))
            ax.axis('off')  # 隐藏坐标轴
            
            # 渲染LaTeX公式
            ax.text(0.5, 0.5, cleaned_formula, 
                    horizontalalignment='center',
                    verticalalignment='center',
                    transform=ax.transAxes,
                    fontsize=20,
                    bbox=dict(boxstyle="round,pad=0.3", facecolor="white", edgecolor="gray"))
            
            # 生成临时文件名和最终文件名
            temp_filename = os.path.join(self.output_dir, f'latex_{formula_id}_temp.png')
            final_filename = os.path.join(self.output_dir, f'latex_{formula_id}.png')
            
            # 保存为临时图片
            plt.tight_layout()
            plt.savefig(temp_filename, dpi=300, bbox_inches='tight', 
                        facecolor='white', edgecolor='none')
            plt.close()  # 关闭图形以释放内存
            
            # 使用投影法裁剪
            img = cv2.imread(temp_filename)
            if img is not None:
                cropped_img = self.cropper(img)
                cv2.imwrite(final_filename, cropped_img)
                
                # 清理临时文件
                if os.path.exists(temp_filename):
                    os.remove(temp_filename)
                
                print(f"✅ Formula image {final_filename} generated")
                return final_filename
            else:
                print(f"❌ Failed to read temporary image: {temp_filename}")
                return None
                
        except Exception as e:
            print(f"❌ Error processing formula: {e}")
            return None
    
    def process_formulas_list(self, formulas: List[str], slide_id: str) -> Dict[str, str]:
        """处理LaTeX公式列表
        
        Args:
            formulas (List[str]): LaTeX公式列表
            slide_id (str): 幻灯片标识符
            
        Returns:
            Dict[str, str]: 公式到图像文件路径的映射
        """
        formula_images = {}
        
        for i, formula in enumerate(formulas):
            if formula.strip():  # 只处理非空公式
                formula_id = f"{slide_id}_{i}"
                image_path = self.process_formula(formula, formula_id)
                if image_path:
                    formula_images[formula] = image_path
        
        return formula_images
    
    def cleanup_temp_files(self):
        """仅清理临时文件，保留生成的LaTeX图片"""
        try:
            if os.path.exists(self.output_dir):
                temp_files = [f for f in os.listdir(self.output_dir) if f.endswith('_temp.png')]
                for temp_file in temp_files:
                    file_path = os.path.join(self.output_dir, temp_file)
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                print(f"✅ Cleaned up {len(temp_files)} temporary files")
        except Exception as e:
            print(f"⚠️ Error cleaning up temporary files: {e}")
    
    def cleanup_all(self):
        """清理所有生成的文件（包括LaTeX图片）"""
        try:
            if os.path.exists(self.output_dir):
                for filename in os.listdir(self.output_dir):
                    file_path = os.path.join(self.output_dir, filename)
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                print(f"✅ Cleaned up all LaTeX files")
        except Exception as e:
            print(f"⚠️ Error cleaning up LaTeX files: {e}")


class CropByProject:
    """投影法裁剪"""

    def __init__(self, threshold: int = 250):
        self.threshold = threshold

    def __call__(self, origin_img):
        image = cv2.cvtColor(origin_img, cv2.COLOR_BGR2GRAY)

        # 反色，将大于threshold的值置为0，小于的改为255
        retval, img = cv2.threshold(image, self.threshold, 255, cv2.THRESH_BINARY_INV)

        # 使文字增长成块
        closed = cv2.dilate(img, None, iterations=1)

        # 水平投影
        x0, x1 = self.get_project_loc(closed, direction="width")

        # 竖直投影
        y0, y1 = self.get_project_loc(closed, direction="height")

        return origin_img[y0:y1, x0:x1]

    @staticmethod
    def get_project_loc(img, direction):
        """获得裁剪的起始和终点索引位置"""
        if direction == "width":
            axis = 0
        elif direction == "height":
            axis = 1
        else:
            raise ValueError(f"direction {direction} is not supported!")

        loc_sum = np.sum(img == 255, axis=axis)
        loc_range = np.argwhere(loc_sum > 0)
        if len(loc_range) == 0:
            return 0, img.shape[axis]
        i0, i1 = loc_range[0][0], loc_range[-1][0]
        return i0, i1


def process_slide_latex(slide_data: Dict, slide_id: str) -> Optional[Dict[str, str]]:
    """处理单个幻灯片的LaTeX公式
    
    Args:
        slide_data (Dict): 幻灯片数据，包含latex字段
        slide_id (str): 幻灯片标识符
        
    Returns:
        Optional[Dict[str, str]]: 公式到图像路径的映射，如果没有公式则返回None
    """
    latex_formulas = slide_data.get('latex', [])
    
    if not latex_formulas or not any(formula.strip() for formula in latex_formulas):
        return None
    
    processor = LatexProcessor()
    try:
        formula_images = processor.process_formulas_list(latex_formulas, slide_id)
        # 清理临时文件，保留生成的LaTeX图片
        processor.cleanup_temp_files()
        return formula_images
    except Exception as e:
        print(f"❌ Error processing slide {slide_id} LaTeX formulas: {e}")
        return None
