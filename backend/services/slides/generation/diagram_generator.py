import io
import os
import re
import requests
import subprocess
import asyncio
import random
from datetime import datetime
from typing import Optional
from pdf2image import convert_from_path


class DiagramGenerator:
    """
    Diagram generation tool class
    Supports generating LaTeX TikZ diagrams and Mermaid diagrams through DeepSeek API
    """

    def __init__(self, deepseek_api_key: Optional[str] = None,
                 serp_api_key: Optional[str] = None):
        """
        Initialize diagram generator

        Args:
            deepseek_api_key: DeepSeek API key (defaults to Config.DEEPSEEK_API_KEY)
            serp_api_key: SerpAPI key (optional, for search fallback)
        """
        from backend.config import Config
        self.deepseek_api_key = deepseek_api_key or Config.DEEPSEEK_API_KEY
        self.serp_api_key = serp_api_key or Config.SERP_API_KEY

        # Create request session
        self.session = requests.Session()
        self.session.trust_env = False
        self.session.verify = True

        # Output directory - use absolute path like image_generator
        current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.output_dir = os.path.join(current_dir, "static", "ppt_templates", "diagrams")
        os.makedirs(self.output_dir, exist_ok=True)

    def generate_diagram_from_prompt(self, prompt: str, output_dir: str = None, ratio: int = 0, num_images: int = 1,
                                     chart_type: str = '') -> Optional[str]:
        """
        Generate diagram from prompt (synchronous version)

        Args:
            prompt: Description of the diagram
            output_dir: Output directory path
            ratio: Image ratio (0 for 4:3, 1 for 16:9)
            num_images: Number of images to generate (for compatibility)
            chart_type: Type of chart (e.g., 'Timeline', 'Flowchart')

        Returns:
            str: Generated image file path, or None if failed
        """
        if output_dir is None:
            output_dir = self.output_dir

        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        print(f"📊 Generating diagram for prompt: {prompt[:100]}...")

        # Generate timestamp and random number for filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        random_num = random.randint(1000, 9999)
        output_filename = f"generated_diagram_{timestamp}_{random_num}"

        try:
            # Check if this is a Mermaid-supported chart type
            mermaid_chart_types = ['timeline', 'flowchart', 'sequence', 'class', 'state', 'gantt', 'pie chart']
            if chart_type.lower() in mermaid_chart_types:
                print(f"📊 Mermaid chart detected ({chart_type}), generating mermaid code...")
                mermaid_code = self._generate_mermaid_code(prompt)
                if mermaid_code:
                    mermaid_output_path = os.path.join(output_dir, f"{output_filename}_mermaid.png")

                    if self._render_mermaid_to_image(mermaid_code, mermaid_output_path):
                        print(f"✅ Mermaid diagram generated: {mermaid_output_path}")
                        return mermaid_output_path
                    else:
                        print(f"⚠️ Mermaid rendering failed, falling back to LaTeX...")
                else:
                    print(f"⚠️ Mermaid code generation failed, falling back to LaTeX...")

            # Fallback to LaTeX generation for non-Mermaid charts or when Mermaid fails
            print(f"🤖 Calling DeepSeek API for LaTeX diagram generation...")
            latex_code = self._call_deepseek_api(prompt)
            if not latex_code:
                print(f"❌ Failed to generate LaTeX code, trying search fallback...")
                return self._search_diagram_fallback(prompt, output_dir, timestamp, random_num)

            # Clean and optimize LaTeX code
            tikz_code = self._clean_latex_code(latex_code)

            # Create complete LaTeX document
            tex_path = os.path.join(output_dir, f'{output_filename}.tex')
            self._create_latex_document(tex_path, tikz_code, ratio)

            # Compile to generate PDF
            print(f"🔨 Compiling LaTeX document...")
            compilation_success = self._compile_latex(output_filename, output_dir)

            if not compilation_success:
                print(f"❌ LaTeX compilation failed, trying search fallback...")
                return self._search_diagram_fallback(prompt, output_dir, timestamp, random_num)

            # Convert PDF to image (without saving PDF)
            pdf_path = os.path.join(output_dir, f'{output_filename}.pdf')
            image_path = self._convert_pdf_to_image(pdf_path, ratio=ratio)

            if image_path and os.path.exists(image_path):
                # Verify the image file is valid and has content
                try:
                    file_size = os.path.getsize(image_path)
                    if file_size > 0:
                        print(f"✅ Diagram generated successfully: {image_path}")
                        return image_path
                    else:
                        print(f"❌ Generated image file is empty: {image_path}")
                        return self._search_diagram_fallback(prompt, output_dir, timestamp, random_num)
                except Exception as e:
                    print(f"❌ Error verifying image file: {e}")
                    return self._search_diagram_fallback(prompt, output_dir, timestamp, random_num)
            else:
                print(f"❌ Failed to convert PDF to image, trying search fallback...")
                return self._search_diagram_fallback(prompt, output_dir, timestamp, random_num)

        except Exception as e:
            print(f"❌ Error generating diagram: {e}")
            print(f"🔄 Trying search fallback...")
            return self._search_diagram_fallback(prompt, output_dir, timestamp, random_num)

    async def generate_diagram_from_prompt_async(self, prompt: str, output_dir: str = None, ratio: int = 0,
                                                 num_images: int = 1, chart_type: str = '') -> Optional[str]:
        """
        Generate diagram from prompt (asynchronous version)

        Args:
            prompt: Description of the diagram
            output_dir: Output directory path
            ratio: Image ratio (0 for 4:3, 1 for 16:9)
            num_images: Number of images to generate (for compatibility)
            chart_type: Type of chart (e.g., 'Timeline', 'Flowchart')

        Returns:
            str: Generated image file path, or None if failed
        """
        return await asyncio.to_thread(
            self.generate_diagram_from_prompt,
            prompt=prompt,
            output_dir=output_dir,
            ratio=ratio,
            num_images=num_images,
            chart_type=chart_type
        )

    def _call_deepseek_api(self, prompt: str) -> Optional[str]:
        """
        Call DeepSeek API to generate LaTeX code

        Args:
            prompt: User input description

        Returns:
            Generated LaTeX code, or None if failed
        """
        headers = {
            'Authorization': f'Bearer {self.deepseek_api_key}',
            'Content-Type': 'application/json'
        }

        chat_prompt = (
            f"Generate a complete LaTeX diagram using TikZ for: {prompt}. "
            "The code must be self-contained and include ALL necessary packages and libraries. "
            "Include: \\usepackage{{tikz}}, \\usepackage{{xcolor}}, \\usetikzlibrary{{positioning}}, \\usetikzlibrary{{arrows.meta}}, \\usetikzlibrary{{shapes.geometric}}. "
            "Use ONLY standard TikZ arrow types: '->', '->>', '->|', 'stealth', 'latex', 'triangle 45'. "
            "AVOID using 'stealth'' (with extra quote) or other non-standard arrow types. "
            "Define any custom styles using \\tikzset{{}}. "
            "Make sure the code is complete and can compile without errors. "
            "Only return the code between ```latex and ```. "
            "IMPORTANT: Avoid overlapping of text and elements in the diagram. All text and graphical elements must be clearly readable and not overlap."
        )

        try:
            resp = self.session.post(
                'https://api.deepseek.com/v1/chat/completions',
                json={
                    'model': 'deepseek-chat',
                    'messages': [{'role': 'user', 'content': chat_prompt}],
                    'temperature': 0.7
                },
                headers=headers,
                timeout=60
            )

            resp.raise_for_status()
            data = resp.json()

            if 'error' in data:
                raise Exception(data['error'])

            latex_code = data['choices'][0]['message']['content']

            # Extract code between ```latex
            if '```latex' in latex_code:
                latex_code = latex_code.split('```latex')[1].split('```')[0].strip()

            return latex_code

        except Exception as e:
            print(f"❌ DeepSeek API call failed: {str(e)}")
            return None

    def _generate_mermaid_code(self, prompt: str) -> Optional[str]:
        """
        Generate mermaid code for diagrams

        Args:
            prompt: Description of the diagram

        Returns:
            str: Generated mermaid code, or None if failed
        """
        headers = {
            'Authorization': f'Bearer {self.deepseek_api_key}',
            'Content-Type': 'application/json'
        }

        mermaid_prompt = (
            f"Generate a mermaid diagram for: {prompt}. "
            "Use appropriate mermaid syntax (flowchart, timeline, classDiagram, etc.). "
            "Make sure the diagram is clear and well-structured. "
            "Only return the mermaid code between ```mermaid and ```."
        )

        try:
            resp = self.session.post(
                'https://api.deepseek.com/v1/chat/completions',
                json={
                    'model': 'deepseek-chat',
                    'messages': [{'role': 'user', 'content': mermaid_prompt}],
                    'temperature': 0.7
                },
                headers=headers,
                timeout=60
            )

            resp.raise_for_status()
            data = resp.json()

            if 'error' in data:
                raise Exception(data['error'])

            mermaid_code = data['choices'][0]['message']['content']

            # Extract code between ```mermaid
            if '```mermaid' in mermaid_code:
                mermaid_code = mermaid_code.split('```mermaid')[1].split('```')[0].strip()
            elif '```' in mermaid_code:  # Fallback for cases where language isn't specified
                mermaid_code = mermaid_code.split('```')[1].split('```')[0].strip()

            return mermaid_code

        except Exception as e:
            print(f"❌ Mermaid code generation failed: {str(e)}")
            return None

    def _render_mermaid_to_image(self, mermaid_code: str, output_path: str) -> bool:
        """
        Render mermaid code to image using mermaid CLI

        Args:
            mermaid_code: Mermaid diagram code
            output_path: Output image path

        Returns:
            bool: True if successful
        """
        try:
            # 1. Create temporary .mmd file
            mmd_path = output_path.replace('.png', '.mmd')
            with open(mmd_path, 'w', encoding='utf-8') as f:
                f.write(mermaid_code)

            # 2. Use mermaid CLI to generate image
            result = subprocess.run(
                ['mmdc', '-i', mmd_path, '-o', output_path, '-t', 'default', '-b', 'transparent'],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode != 0:
                print(f"❌ Mermaid rendering failed: {result.stderr}")
                return False

            return True

        except Exception as e:
            print(f"❌ Mermaid rendering exception: {str(e)}")
            return False
        finally:
            # Clean up temporary file
            if 'mmd_path' in locals() and os.path.exists(mmd_path):
                os.remove(mmd_path)

    def _clean_latex_code(self, latex_code: str) -> str:
        """
        Clean and optimize LaTeX code

        Args:
            latex_code: Original LaTeX code

        Returns:
            Cleaned TikZ code
        """
        # Only remove documentclass declaration, keep all other content
        latex_code = re.sub(r'\\documentclass.*?{.*?}', '', latex_code, flags=re.DOTALL)

        # Keep all package declarations and document environment
        return latex_code

    def _create_latex_document(self, tex_path: str, tikz_code: str, ratio: int):
        """
        Create complete LaTeX document

        Args:
            tex_path: TeX file path
            tikz_code: TikZ code
            ratio: Image ratio (0 for 4:3, 1 for 16:9)
        """
        # Define document class options - standalone doesn't support ratio options
        doc_class_options = "[border=1mm]"

        # Simple template without usepackage declarations
        latex_template = f"""\\documentclass{doc_class_options}{{standalone}}
{tikz_code}
"""

        with open(tex_path, 'w', encoding='utf-8') as f:
            f.write(latex_template)

    def _compile_latex(self, filename: str, output_dir: str) -> bool:
        """
        Compile LaTeX document

        Args:
            filename: Filename (without extension)
            output_dir: Output directory

        Returns:
            Whether compilation was successful
        """
        try:
            # Check if pdflatex is available
            try:
                result = subprocess.run(
                    ['pdflatex', '--version'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.returncode != 0:
                    print(f"❌ Error: pdflatex not available")
                    print(f"Please ensure MiKTeX or TeX Live is installed")
                    return False
            except FileNotFoundError:
                print(f"❌ Error: pdflatex command not found")
                print(f"Please install MiKTeX: https://miktex.org/download")
                return False

            # Compile LaTeX document
            print(f"🔨 Compiling LaTeX document: {filename}.tex")
            result = subprocess.run(
                ['pdflatex', '-interaction=nonstopmode', '-output-directory', output_dir, f'{filename}.tex'],
                cwd=output_dir,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=60
            )

            if result.returncode != 0:
                print(f"❌ LaTeX compilation failed, return code: {result.returncode}")
                return False

            print(f"✅ LaTeX compilation successful")
            return True

        except subprocess.TimeoutExpired:
            print("❌ LaTeX compilation timeout")
            return False
        except Exception as e:
            print(f"❌ LaTeX compilation exception: {str(e)}")
            return False

    def _convert_pdf_to_image(self, pdf_path: str, dpi: int = 300, ratio: int = 0) -> Optional[str]:
        """
        Convert PDF to PNG image，并根据ratio调整图片尺寸

        Args:
            pdf_path: PDF file path
            dpi: Image resolution
            ratio: 0为4:3，1为16:9

        Returns:
            Image file path, or None if failed
        """
        try:
            from PIL import Image
            # Generate image filename
            image_path = pdf_path.replace('.pdf', '.png')

            # Convert PDF to image
            images = convert_from_path(pdf_path, dpi=dpi)

            if images:
                # Save first page as PNG
                img = images[0]
                # 根据ratio调整图片尺寸
                if ratio == 1:
                    target_size = (1280, 720)  # 16:9
                else:
                    target_size = (960, 720)  # 4:3
                img = img.resize(target_size, Image.LANCZOS)
                img.save(image_path, 'PNG')
                print(f"✅ PDF converted to image: {image_path}, resized to {target_size}")
                return image_path
            else:
                print("❌ PDF conversion failed: no images generated")
                return None

        except Exception as e:
            print(f"❌ PDF to image conversion failed: {str(e)}")
            return None

    def _search_diagram_fallback(self, prompt: str, output_dir: str, timestamp: str, random_num: int) -> Optional[str]:
        """
        Search fallback when diagram generation fails

        Args:
            prompt: Original prompt
            output_dir: Output directory
            timestamp: Timestamp for filename
            random_num: Random number for filename

        Returns:
            str: Downloaded image path, or None if failed
        """
        print(f"🔍 Searching for diagram images as fallback...")

        try:
            # Search for diagram images using Google
            search_results = self._search_diagram_images(prompt)

            if search_results:
                # Download the first result
                image_url = search_results[0]
                image_path = os.path.join(output_dir, f"searched_diagram_{timestamp}_{random_num}.jpg")

                print(f"📥 Downloading diagram from: {image_url}")
                response = requests.get(image_url, timeout=30)

                if response.status_code == 200:
                    with open(image_path, 'wb') as f:
                        f.write(response.content)
                    print(f"✅ Downloaded diagram: {image_path}")
                    return image_path
                else:
                    print(f"❌ Failed to download image: HTTP {response.status_code}")
            else:
                print(f"❌ No search results found")

        except Exception as e:
            print(f"❌ Search fallback failed: {e}")

        return None

    def _search_diagram_images(self, prompt: str, max_results: int = 5) -> list:
        """
        Search for diagram images using Google

        Args:
            prompt: Search prompt
            max_results: Maximum number of results

        Returns:
            list: List of image URLs
        """
        try:
            # Use SerpAPI for Google image search
            if not self.serp_api_key:
                print("❌ SerpAPI key not configured for search fallback")
                return []

            params = {
                'engine': 'google',
                'q': f"{prompt} diagram chart flowchart infographic",
                'tbm': 'isch',
                'api_key': self.serp_api_key,
                'num': max_results
            }

            response = requests.get('https://serpapi.com/search', params=params, timeout=30)
            data = response.json()

            if 'error' in data:
                print(f"❌ Search API error: {data['error']}")
                return []

            results = []
            for img in data.get('images_results', [])[:max_results]:
                if 'original' in img:
                    results.append(img['original'])

            print(f"🔍 Found {len(results)} diagram images")
            return results

        except Exception as e:
            print(f"❌ Search failed: {e}")
            return []


# Create global diagram generator instance
diagram_generator = DiagramGenerator()


# Convenience function for compatibility with image_generator
async def generate_diagram_from_prompt_async(prompt: str, output_dir: str = None, ratio: int = 0, num_images: int = 1,
                                             chart_type: str = '') -> Optional[str]:
    """
    Generate diagram from prompt (async version)

    Args:
        prompt: Description of the diagram
        output_dir: Output directory path
        ratio: Image ratio (0 for 4:3, 1 for 16:9)
        num_images: Number of images to generate (for compatibility)
        chart_type: Type of chart (e.g., 'Timeline', 'Flowchart')

    Returns:
        str: Generated image file path, or None if failed
    """
    return await diagram_generator.generate_diagram_from_prompt_async(prompt, output_dir, ratio, num_images, chart_type)
