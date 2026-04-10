import os
import time
from datetime import datetime
from backend.config import Config
from backend.services.slides.md_parser import MarkdownViewer as MDParser
from backend.services.slides.ppt_creator import PPTCreator
from backend.services.slides.chapter_summarizer import ChapterSummarizer
from backend.services.slides.word_generator import generate_talking_script_word


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
    async def generate_script(slides_results, style, title, provider='local_ollama'):
        summarizer = ChapterSummarizer()
        scripts = await summarizer.generate_talking_script(slides_results, style, provider=provider)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"talking_script_{timestamp}.docx"
        output_path = os.path.join(Config.SCRIPT_RESULTS_FOLDER, filename)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        generate_talking_script_word(scripts, output_path, title)
        return scripts, filename

    @staticmethod
    def save_highlights(filename, highlights_data):
        """
        保存前端传来的高亮数据：
        1. JSON 文件（用于前端加载恢复），固定文件名覆盖写
        2. Markdown 文件（人可读的快照），固定文件名覆盖写
        highlights_data 格式:
        [{ "sectionTitle": "xxx", "highlights": [{ "id": "...", "text": "..." }] }]
        """
        os.makedirs(Config.SUB1_HIGHLIGHTS_FOLDER, exist_ok=True)

        # 将前端传来的 Pydantic 模型转换为字典列表
        if highlights_data and hasattr(highlights_data[0], 'dict'):
            highlights_list = [item.dict() for item in highlights_data]
        else:
            highlights_list = highlights_data

        # 1) 保存 JSON（前端可直接加载恢复）- 固定文件名覆盖
        json_filename = f"highlights_{filename}.json"
        json_path = os.path.join(Config.SUB1_HIGHLIGHTS_FOLDER, json_filename)

        import json
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(highlights_list, f, ensure_ascii=False, indent=2)

        # 2) 保存 Markdown（人类可读快照）- 固定文件名覆盖
        md_filename = f"highlights_{filename}.md"
        md_path = os.path.join(Config.SUB1_HIGHLIGHTS_FOLDER, md_filename)

        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(f"# Key Highlights for: {filename}\n\n")
            f.write(f"*Generated on {time.strftime('%Y-%m-%d %H:%M:%S')}*\n\n---\n\n")

            for section in highlights_list:
                section_title = section.get('sectionTitle', 'Untitled Section') if isinstance(section,
                                                                                              dict) else getattr(
                    section, 'sectionTitle', 'Untitled Section')
                f.write(f"## {section_title}\n\n")

                highlights_items = section.get('highlights', []) if isinstance(section, dict) else getattr(section,
                                                                                                           'highlights',
                                                                                                           [])

                for h in highlights_items:
                    text = h.get('text', '') if isinstance(h, dict) else getattr(h, 'text', '')
                    f.write(f"> {text}\n\n")
                f.write("\n")

        return json_filename

    @staticmethod
    def load_highlights(filename):
        """
        加载某个 combined 文件的已保存高亮。
        优先读 JSON 文件（结构化数据），返回 flat highlight 列表。
        """
        import json

        json_filename = f"highlights_{filename}.json"
        json_path = os.path.join(Config.SUB1_HIGHLIGHTS_FOLDER, json_filename)

        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                sections_data = json.load(f)
            # 展平为前端需要的 flat 格式
            flat = []
            for section in sections_data:
                section_title = section.get('sectionTitle', '')
                for h in section.get('highlights', []):
                    flat.append({
                        'id': h.get('id', ''),
                        'text': h.get('text', ''),
                        'sectionTitle': section_title,
                    })
            return flat

        return []