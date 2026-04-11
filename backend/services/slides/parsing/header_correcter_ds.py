import aiohttp

async def header_correction(input_text):
    """
    异步版本的标题纠正函数，使用 aiohttp 直接调用 DeepSeek API
    """
    url = "https://api.deepseek.com/v1/chat/completions"
    headers = {
        "Authorization": "Bearer sk-f2b923f129634f49ac37c3d675595acf",
        "Content-Type": "application/json"
    }

    prompt = (f'''
    You are an expert document structure analyst. I have a Markdown document with incorrectly classified headers and some non-header text mistakenly identified as headers. Your task is to analyze and correct these headers using systematic reasoning.

    **CONTEXT AWARENESS**: Consider the document's hierarchical structure, typical academic/technical writing patterns, and logical content organization when making corrections.

    **STEP-BY-STEP REASONING PROCESS**:
    1. First, examine each entry and ask: "Is this actually a header or just formatted text?"
    2. Then, evaluate the semantic meaning: "Does this represent a section/subsection title?"
    3. Check hierarchy consistency: "Does the header level make sense in context?"
    4. Finally, verify formatting: "Is this properly structured as a Markdown header?"

    **FEW-SHOT EXAMPLES**:

    Example 1 - Remove non-headers:
    Input: {{"level": 2, "text": "**bold text**", "line": 15}}
    Reasoning: This is just bold formatting, not a section title
    Action: REMOVE

    Example 2 - Fix hierarchy:
    Input: {{"level": 1, "text": "Experimental Results", "line": 45}}
    Context: Following a level 1 "Methodology" section
    Reasoning: Should be level 2 as it's a subsection of main content
    Action: CORRECT to level 2

    Example 3 - Keep valid headers:
    Input: {{"level": 2, "text": "Data Collection Methods", "line": 23}}
    Reasoning: Clear section title with semantic meaning
    Action: KEEP

    **CONSTRAINT-BASED RULES** (Apply in order):
    1. REMOVE: Code snippets, URLs, file paths, or text containing only special characters
    2. REMOVE: Regular paragraph text that was misidentified due to formatting
    3. REMOVE: Table headers, figure captions, or reference citations
    4. CORRECT: Headers with wrong nesting levels (ensure logical hierarchy: 1 → 2 → 3)
    5. KEEP: Legitimate section titles that represent content organization
    6. MAINTAIN: Original text content for valid headers
    7. FORMAT: Return exactly in original JSON structure

    **DOCUMENT STRUCTURE CONTEXT**: Consider typical patterns:
    - Level 1: Major sections (Introduction, Methodology, Results, Conclusion)
    - Level 2: Subsections within major sections
    - Level 3: Sub-subsections or detailed breakdowns

    Input headers to analyze:
    {input_text}

    Think through each header systematically, then return ONLY the corrected headers in the original JSON format with no additional commentary.
    ''')

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system",
             "content": "You are a helpful assistant specialized in document structure analysis and header correction."},
            {"role": "user", "content": prompt}
        ],
        "stream": False
    }

    try:
        # 使用 aiohttp 发起异步请求
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload, ssl=False) as response:
                response.raise_for_status()  # 检查 HTTP 状态码
                result = await response.json()

                # 提取返回的内容
                output = result['choices'][0]['message']['content']
                # 清理 Markdown JSON 格式标记
                cleaned_output = output.strip('```json\n').strip('```').strip()

                return cleaned_output

    except Exception as e:
        print(f"❌ Error in header_correction: {e}")
        # 如果请求失败，直接返回原输入（避免整个程序崩溃）
        return input_text
