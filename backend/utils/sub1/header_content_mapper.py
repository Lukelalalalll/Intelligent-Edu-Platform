from mrkdwn_analysis import MarkdownAnalyzer
from .finder import file_finder

class MarkdownViewer:
    def __init__(self, input_file):
        self.file_path = file_finder(input_file)
        self.full_content = []
        self.header_sections = []
        self.sections_dict = {}

        if self.file_path:
            self.load_file()
        else:
            print("File not found")

    def load_file(self):
        """Load the markdown file and analyze it."""
        self.full_content = self._load_full_content(self.file_path)
        analyzer = MarkdownAnalyzer(self.file_path)

        headers_data = analyzer.identify_headers()
        headers = [{
            'level': item['level'],
            'text': item['text'],
            'line': item['line']
        } for item in headers_data['Header']]

        self.header_sections = self._map_header_sections(self.full_content, headers)
        self.create_sections_dict()

    def _load_full_content(self, filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read().split('\n')

    def _map_header_sections(self, full_content, headers):
        """Map headers to their respective content ranges."""
        sections = []
        for i, header in enumerate(headers):
            start_line = header['line']
            end_line = headers[i + 1]['line'] - 1 if i < len(headers) - 1 else len(full_content) - 1
            sections.append({
                'header': header,
                'start': start_line,
                'end': end_line
            })
        return sections

    def create_sections_dict(self):
        """Create a dictionary with section titles and their corresponding content."""
        for section in self.header_sections:
            header = section['header']
            content_lines = self.full_content[section['start']:section['end']]
            content = '\n'.join(content_lines)
            self.sections_dict[header['text']] = content

    def get_sections_dict(self):
        """Return the dictionary of sections."""
        return self.sections_dict
