import aiohttp
import asyncio
import json
import os

# Configurable concurrency limit for LLM API calls
MAX_CONCURRENT_LLM_CALLS = int(os.getenv("SUB1_MAX_CONCURRENT_LLM", "5"))


class SectionSummarizer:
    def __init__(self):
        from backend.config import Config
        self.url = "https://api.deepseek.com/v1/chat/completions"
        self.headers = {
            'Authorization': f'Bearer {Config.DEEPSEEK_API_KEY}',
            'Content-Type': 'application/json'
        }
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_LLM_CALLS)
        self.system_prompt = '''
            You are an expert academic summarizer, specialized in extracting dense, entity-rich highlights from technical papers.
            The final output should strictly follow by the following schema:
            {
                "$schema": "http://json-schema.org/draft-04/schema#",
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string"
                    },
                    "content": {
                        "type": "array",
                        "items": [
                            {
                                "type": "string"
                            }
                        ]
                    },
                    "latex": {
                        "type": "array",
                        "items": [
                            {
                                "type": "string"
                            }
                        ]
                    },
                    "chart_type": {
                        "type": "string"
                    },
                    "chart_reasoning": {
                        "type": "array",
                        "items": [
                            {
                                "type": "string"
                            }
                        ]
                    }
                },
                "required": [
                    "title",
                    "content",
                    "latex",
                    "chart_type",
                    "chart_reasoning"
                ]
            }
        '''

    def _get_prompt(self, num_of_bullets, words_each_bullet):
        return f'''
            **TASK**:
            Evaluate the given sections with highlights and only generate JSON output:

            The process involves the following structured steps:

            1. For each highlighted section, identify 3–5 core entities—these may include concepts, methods, or results.
            2. If highlights include category tags (definition/concept/formula/example/conclusion/caution), prioritize:
               - **definitions** and **conclusions** as primary bullet points
               - **formulas** in the LaTeX extraction field
               - **examples** as evidence for chart_reasoning
               - **caution** items as separate bullet points when space allows
            3. Generate an initial set of summary points, ensuring that all critical entities are preserved.
            4. Refine the output iteratively by:

            * Removing redundant phrases
            * Merging related ideas
            * Incorporating any missing entities from the source text
            4. Finalize **exactly {num_of_bullets}** bullet points per section, each with a strict limit of **{words_each_bullet} words**.
             
            **IMPORTANT RULES**:
            1. **DO NOT add citations unless the content explicitly mentions specific authors or studies.**
            2. **DO NOT add `[Author, Year]` at the end of bullet points without actual references.**

            **LATEX FORMULA EXTRACTION**:
            1. **Carefully scan the section content for LaTeX mathematical formulas enclosed in double dollar signs ($$...$$).**
            2. **Extract ONLY the LaTeX content between the double dollar signs and include them in the "latex" field as a list of strings.**
            3. **If no LaTeX formulas are found in the section, provide an empty array for the "latex" field.**
            4. **DO NOT include the double dollar signs ($$) themselves, only extract the LaTeX formula content.**
            5. **Examples of what to extract:**
               - $$E = mc^2$$ → extract "E = mc^2"
               - $$\\frac{{a}}{{b}} = c$$ → extract "\\frac{{a}}{{b}} = c"
               - $$\\sum_{{i=1}}^{{n}} x_i$$ → extract "\\sum_{{i=1}}^{{n}} x_i"

            **CHART TYPE RECOMMENDATION WITH REASONING**:
            1. **Analyze the section content and select the most appropriate chart type from: Flowchart, Bar Chart, Pie Chart, Line Chart, Scatter Plot, Organization Chart, Mind Map, Concept Map, Timeline, Table, Image/Diagram, or No Chart.**
            2. **First extract entities from the content, then determine logical relationships, and generate a detailed prompt:**
               - Extract all relevant data points, entities, and key concepts from the section content
               - Analyze the logical relationships between these entities (comparisons, processes, hierarchies, trends, etc.)
               - Generate a comprehensive prompt that combines the entities and their logical relationships
               - Include specific formatting requirements (column names, visual styles, layout)
               - Provide clear labels, organizational structure, and professional presentation standards
            3. **Example formats:**
               - Table: "A business summary table listing the key performance indicators(KPIs) for five departments: Sales, Marketing, Operations, Finance, and HR. The columns should be: 'Department', 'Budget (in USD)', 'Actual Spend (in USD)', 'Variance (%)', and 'Performance Rating'. Fill in realistic numbers for each cell. The table should use alternating row shading and have bold headers. Include a footer row showing total budget and spend."
               - Flowchart: "A flowchart illustrating the decision-making process for launching a new product in the market. The flow starts with 'Market Research', followed by a decision node 'Is there sufficient demand?'. If yes, the path continues to 'Develop Prototype', 'Conduct User Testing', and then 'Finalize Product Design'. If no, the path leads to 'Re-evaluate Market Strategy'. The flowchart should include labeled arrows and distinct shapes: rectangles for actions, diamonds for decisions."

            **TONE**
            The tone must remain formal, evidence-based, and free from exaggerated or flamboyant language. Emphasize novel findings and preserve all quantitative results. Do not include background or introductory information unless it is essential for understanding the result.

            **OUTPUT**
            Generate exactly {num_of_bullets} bullet points, each with a strict limit of {words_each_bullet} words.
            Include a "latex" field containing an array of LaTeX formulas found in the section content.
            Include a "chart_type" field with a recommended chart type based on the section content.
            Include a "chart_reasoning" field with ONE complete, detailed prompt sentence for chart generation.

            **EXAMPLE** 
            * **Input highlight**: "Ablation study shows CodeRender improves success rate by 20.4% [Zhang, 2023]"
            * **Output bullet**: "CodeRender boosts task success rates by 20.4% [Zhang, 2023]" (18 words)
        '''

    async def fetch_data(self, session, data):
        async with self._semaphore:
            try:
                async with session.post(self.url, json=data, headers=self.headers, ssl=False, timeout=aiohttp.ClientTimeout(total=60)) as response:
                    response.raise_for_status()
                    return await response.json()
            except aiohttp.ClientError as e:
                print(f"Request failed: {e}")
                return {"_error": str(e)}
            except asyncio.TimeoutError:
                print("Request timed out")
                return {"_error": "timeout"}

    async def summarize_sections(self, highlights_data, num_of_bullets, words_each_bullet):
        prompt = self._get_prompt(num_of_bullets, words_each_bullet)
        data_list = [{
            "model": "deepseek-chat",
            "messages": [
                {
                    "role": "system",
                    "content": self.system_prompt
                },
                {
                    "role": "user",
                    "content": prompt + str(highlight)
                }
            ],
            "stream": False,
            "max_tokens": 500,
            "temperature": 0.5
        } for highlight in highlights_data]

        final_results = []
        failed_sections = []
        async with aiohttp.ClientSession() as session:
            tasks = [self.fetch_data(session, data) for data in data_list]
            results = await asyncio.gather(*tasks)
            for i, result in enumerate(results, start=1):
                if result and "_error" not in result:
                    try:
                        output_str = result['choices'][0]['message']['content'].strip('```json\n').strip('```')
                        output_dict = json.loads(output_str)
                        output_dict["slide_number"] = i
                        output_dict["_status"] = "success"
                        final_results.append(output_dict)
                    except (KeyError, json.JSONDecodeError) as e:
                        print(f"Error processing section {i}: {e}")
                        failed_sections.append({
                            "slide_number": i,
                            "_status": "failed",
                            "_error": f"parse_error: {e}",
                            "title": highlights_data[i-1].get('title', f'Section {i}') if i <= len(highlights_data) else f'Section {i}',
                            "content": [],
                            "latex": [],
                            "chart_type": "No Chart",
                            "chart_reasoning": []
                        })
                        final_results.append(failed_sections[-1])
                else:
                    error_msg = result.get("_error", "unknown") if result else "no_response"
                    print(f"Section {i} failed: {error_msg}")
                    placeholder = {
                        "slide_number": i,
                        "_status": "failed",
                        "_error": error_msg,
                        "title": highlights_data[i-1].get('title', f'Section {i}') if i <= len(highlights_data) else f'Section {i}',
                        "content": ["[Content generation failed — please retry this section]"],
                        "latex": [],
                        "chart_type": "No Chart",
                        "chart_reasoning": []
                    }
                    failed_sections.append(placeholder)
                    final_results.append(placeholder)

        if failed_sections:
            print(f"⚠️ {len(failed_sections)}/{len(highlights_data)} sections failed, partial results returned")

        return final_results

    def summarize(self, highlights_data, num_of_bullets, words_each_bullet):
        """同步方法，用于在Flask路由中调用"""
        return asyncio.run(self.summarize_sections(highlights_data, num_of_bullets, words_each_bullet)) 