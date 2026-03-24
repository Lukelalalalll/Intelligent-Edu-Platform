import os
import time
from datetime import datetime
from backend.config import Config
from backend.utils.sub1.md_parser import MarkdownViewer as MDParser
from backend.utils.sub1.ppt_creator import PPTCreator
from backend.utils.sub1.chapter_summarizer import ChapterSummarizer
from backend.utils.sub1.word_generator import generate_talking_script_word


class Sub1Service:
    @staticmethod
    def parse_md(filepath, use_llm):
        parser = MDParser()
        parser.load_file(filepath, use_llm)
        return {
            'headers': [{'index': i + 1, 'level': s['header']['level'], 'text': s['header']['text']} for i, s in
                        enumerate(parser.header_sections)],
            'full_content': parser.full_content,
            'sections': parser.header_sections,
            'tables': [{'index': i + 1, 'section_title': s['section']['text'], 'table': s['table']} for i, s in
                       enumerate(parser.table_sections)]
        }

    @staticmethod
    def create_ppt(ppt_schema):
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"presentation_{timestamp}.pptx"
        output_path = os.path.join(Config.PPT_RESULTS_FOLDER, filename)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        creator = PPTCreator(Config.PPT_TEMPLATES_FOLDER)
        creator.create_presentation(ppt_schema, output_path)
        return filename

    @staticmethod
    def generate_script(slides_results, style, title):
        summarizer = ChapterSummarizer()
        scripts = summarizer.generate_script_sync(slides_results, style)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"talking_script_{timestamp}.docx"
        output_path = os.path.join(Config.SCRIPT_RESULTS_FOLDER, filename)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        generate_talking_script_word(scripts, output_path, title)
        return scripts, filename

    @staticmethod
    def save_highlights(filename, highlights_data):
        """
        保存前端传来的高亮数据为 Markdown 文件
        highlights_data 格式:
        [{ "sectionTitle": "xxx", "highlights": [{ "id": "...", "text": "..." }] }]
        """
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        out_filename = f"highlights_{filename}_{timestamp}.md"

        # 确保高亮文件夹存在
        os.makedirs(Config.SUB1_HIGHLIGHTS_FOLDER, exist_ok=True)
        out_path = os.path.join(Config.SUB1_HIGHLIGHTS_FOLDER, out_filename)

        # 将前端传来的 Pydantic 模型（如果是列表的话）转换为字典列表
        # FastAPI 中 req.highlights 可能是 Pydantic 对象列表，这里做个兼容保护
        if highlights_data and hasattr(highlights_data[0], 'dict'):
            highlights_list = [item.dict() for item in highlights_data]
        else:
            highlights_list = highlights_data

        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(f"# Key Highlights for: {filename}\n\n")
            f.write(f"*Generated on {time.strftime('%Y-%m-%d %H:%M:%S')}*\n\n---\n\n")

            for section in highlights_list:
                # 获取字典的键时使用 .get() 防错
                section_title = section.get('sectionTitle', 'Untitled Section') if isinstance(section,
                                                                                              dict) else getattr(
                    section, 'sectionTitle', 'Untitled Section')
                f.write(f"## {section_title}\n\n")

                # 获取高亮列表
                highlights_items = section.get('highlights', []) if isinstance(section, dict) else getattr(section,
                                                                                                           'highlights',
                                                                                                           [])

                for h in highlights_items:
                    text = h.get('text', '') if isinstance(h, dict) else getattr(h, 'text', '')
                    f.write(f"> {text}\n\n")
                f.write("\n")

        return out_filename