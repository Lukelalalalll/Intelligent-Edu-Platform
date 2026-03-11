import json
import os
import re
import pandas as pd
from mrkdwn_analysis import MarkdownAnalyzer
from .header_correcter_ds import header_correction
import asyncio


class MarkdownViewer:
    def __init__(self):
        self.analyzer = None
        self.headers = []
        self.full_content = []
        self.header_sections = []
        self.headers_count = 0
        self.table_sections = []

    def load_file(self, filepath, use_llm=True):
        """Load and analyze a markdown file"""
        try:
            # 设置输出路径
            base_name = os.path.splitext(os.path.basename(filepath))[0]
            os.makedirs('md/json', exist_ok=True)
            os.makedirs('md/csv', exist_ok=True)
            json_output = f"md/json/{base_name}_tables.json"
            csv_output = f"md/csv/{base_name}_tables.csv"

            self.analyzer = MarkdownAnalyzer(filepath)
            self.headers = self._get_headers_with_lines(use_llm)
            self.full_content = self._load_full_content(filepath)
            self.header_sections = self._map_header_sections()
            self.headers_count = len(self.headers)
            self.table_sections = self._map_table_sections()
            
            # 获取表格数据并导出
            try:
                tables_data = self.analyzer.identify_tables()
                
                # 检查是否有表格数据
                if not tables_data or "Table" not in tables_data or not tables_data["Table"]:
                    print("No tables found!")
                    # 创建空的表格数据结构
                    tables_data = {"Table": []}
                else:
                    # 保存为JSON文件
                    with open(json_output, 'w', encoding='utf-8') as f:
                        json.dump(tables_data, f, indent=2, ensure_ascii=False)
                    print(f"JSON file generated: {json_output}")
                    
                    # 生成CSV文件
                    for i, table in enumerate(tables_data["Table"], 1):
                        df = self._process_table(table)
                        
                        # 生成CSV文件名
                        base_name = os.path.splitext(csv_output)[0]
                        csv_file = f"{base_name}_{i}.csv"
                        
                        # 保存为CSV
                        df.to_csv(csv_file, index=False, encoding='utf-8')
                        print(f"CSV file generated: {csv_file}")
            except Exception as e:
                print("No tables found!")
                # 创建空的表格数据结构
                tables_data = {"Table": []}

        except Exception as e:
            print(f"Error processing file: {str(e)}")
            raise

    def _get_headers_with_lines(self, use_llm=True):
        """Identify and correct headers"""
        raw_headers_data = self.analyzer.identify_headers()
        if use_llm:
            print("\033[93m Fetching corrected headers from LLM...\033[0m")
            # headers_data = header_correction(raw_headers_data)
            headers_data = asyncio.run(header_correction(str(raw_headers_data)))
            if isinstance(headers_data, str) and headers_data != str(raw_headers_data):
                print("\033[92m✓ Corrected headers fetched!\033[0m")
                headers_data = eval(headers_data)
                return [{
                    'level': item['level'],
                    'text': item['text'],
                    'line': item['line']
                } for item in headers_data['Header']]
            else:
                print("\033[91m Failed to fetch corrected headers from LLM, the raw headers are used\033[0m")
                return [{
                    'level': item['level'],
                    'text': item['text'],
                    'line': item['line']
                } for item in raw_headers_data['Header']]
        else:
            print("\033[93m User chose to use raw headers.\033[0m")
            return [{
                'level': item['level'],
                'text': item['text'],
                'line': item['line']
            } for item in raw_headers_data['Header']]

    def _load_full_content(self, filepath):
        """Load file content"""
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read().split('\n')

    def _map_header_sections(self):
        """Map headers to their respective content ranges"""
        sections = []
        for i, header in enumerate(self.headers):
            start_line = header['line']
            end_line = self.headers[i + 1]['line'] - 1 if i < len(self.headers) - 1 else len(self.full_content) - 1
            sections.append({
                'header': header,
                'start': start_line,
                'end': end_line
            })
        return sections

    def _find_table_position(self, table, used_header_positions):
        """Search for table position in file"""
        def build_pattern(row):
            cells = [cell.strip() for cell in row]
            pattern = r'\s*\|\s*'.join(re.escape(cell) if cell else r'\s*' for cell in cells)
            return r'\s*\|\s*' + pattern + r'\s*\|\s*'

        if not table.get("header"):
            return 0
            
        header_pattern = build_pattern(table["header"])
        
        for i in range(len(self.full_content)):
            if re.search(header_pattern, self.full_content[i]):
                if header_pattern in used_header_positions:
                    if i <= used_header_positions[header_pattern]:
                        continue
                used_header_positions[header_pattern] = i
                return i
        
        return 0

    def _map_table_sections(self):
        """Map tables to their respective header sections"""
        try:
            tables_data = self.analyzer.identify_tables()
            if not tables_data or "Table" not in tables_data or not tables_data["Table"]:
                return []
        except Exception as e:
            return []
            
        table_sections = []
        used_header_positions = {}
        
        for table in tables_data["Table"]:
            table_start = self._find_table_position(table, used_header_positions)
            
            for section in self.header_sections:
                if section['start'] <= table_start <= section['end']:
                    table_sections.append({
                        'table': table,
                        'section': section['header'],
                        'start': table_start
                    })
                    break

        return table_sections

    def _process_cell(self, cell):
        """Process cell content, replace <br> with \n"""
        if not cell:
            return ""
        return cell.replace("<br>", "\n").strip()

    def _process_table(self, table):
        """Process single table data, convert to DataFrame"""
        headers = table["header"]
        rows = table["rows"]
        
        processed_rows = []
        for row in rows:
            processed_row = [self._process_cell(cell) for cell in row]
            processed_rows.append(processed_row)
        
        return pd.DataFrame(processed_rows, columns=headers)

    def get_table_with_header(self, table_index):
        """Get table and its header by index"""
        if 0 <= table_index < len(self.table_sections):
            return self.table_sections[table_index]
        return None

def export_combined_sections(filename, file_data, selected_indices):
    """
    导出选中的章节到一个新的Markdown文件，使用固定的命名规则
    :param filename: 原始文件名
    :param file_data: 包含sections和content的文件数据
    :param selected_indices: 用户选择的章节索引列表（从1开始）
    :return: 输出文件的路径
    """
    selected_content = []

    for idx in selected_indices:
        if 1 <= idx <= len(file_data['sections']):
            section = file_data['sections'][idx - 1]
            header = section['header']
            content_lines = file_data['content'][section['start']:section['end']]

            # 添加标题（根据级别添加对应数量的#）
            header_prefix = '#' * header['level']
            selected_content.append(f"{header_prefix} {header['text']}\n")

            # 添加内容，处理标题行和普通行
            for line in content_lines:
                # 如果是标题行（以#开头），则跳过
                if line.startswith('#'):
                    line = line.replace('#', '').strip()
                selected_content.append(line + '\n')

            selected_content.append("\n")  # 章节间添加空行

    # 确保输出目录存在
    os.makedirs('md', exist_ok=True)
    
    # 生成输出文件名
    output_filename = f"{os.path.splitext(filename)[0]}_combined.md"
    output_path = os.path.join('md', output_filename)
    
    # 写入文件
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(''.join(selected_content))

    print(f"\n\033[92m Successfully exported to {output_path}\033[0m")
    return output_path

