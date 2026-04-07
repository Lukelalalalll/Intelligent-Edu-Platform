import os

def file_finder(input_file):
    """在项目的md文件夹中查找文件"""
    # 获取当前文件所在目录的路径
    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # 构建md文件夹的路径
    md_dir = os.path.join(current_dir, 'md')
    
    # 确保md文件夹存在
    if not os.path.exists(md_dir):
        print(f"MD directory not found: {md_dir}")
        return None
        
    # 构建完整的文件路径
    file_path = os.path.join(md_dir, input_file)
    
    # 检查文件是否存在
    if os.path.exists(file_path):
        print(f"Found file in md directory: {file_path}")
        return file_path
    else:
        print(f"File '{input_file}' not found in md directory")
        return None

