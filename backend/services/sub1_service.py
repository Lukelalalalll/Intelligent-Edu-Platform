import os
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
        output_path = os.path.join(Config.PPT_RESULTS_FOLDER, 'sub1', filename)
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
        output_path = os.path.join(Config.SCRIPT_RESULTS_FOLDER, 'sub1', filename)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        generate_talking_script_word(scripts, output_path, title)
        return scripts, filename