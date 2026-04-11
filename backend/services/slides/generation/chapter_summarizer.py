import aiohttp
import asyncio
import json
import math
import os
import re

# Configurable concurrency limit for LLM API calls
MAX_CONCURRENT_LLM_CALLS = int(os.getenv("SUB1_MAX_CONCURRENT_LLM", "5"))


class ChapterSummarizer:
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
                    "slides": {
                    "type": "array",
                    "items": [
                        {
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
                    ]
                    }
                },
                "required": [
                    "slides"
                ]
        }
        '''

    def _get_prompt(self, target_pages, chapter_index, total_chapters, num_of_bullets=3, words_each_bullet=25):
        return f'''
            **TASK**:
            You are summarizing chapter {chapter_index + 1} of {total_chapters} chapters.
            Generate exactly {target_pages} slides for this chapter, with each slide containing exactly {num_of_bullets} bullet points.

            The process involves the following structured steps:

            1. Identify the key points and main arguments in the chapter
            2. Extract important findings, methodologies, and conclusions
            3. Organize the content into exactly {target_pages} slides
            4. Each slide must contain exactly {num_of_bullets} bullet points
            5. Each bullet point must have a strict limit of {words_each_bullet} words
            6. When referenced, use academic citations in the `[Author, Year]` format.

            **IMPORTANT RULES**:
            1. For the first slide, MUST use the exact title provided in the Chapter Title.
            2. For all other slides, you can generate appropriate titles based on the content.
            3. Each bullet point must be concise but informative, within {words_each_bullet} words limit.
            4. **DO NOT add citations unless the content explicitly mentions specific authors or studies.**
            5. **DO NOT add `[Author, Year]` at the end of bullet points without actual references.**

            **LATEX FORMULA EXTRACTION**:
            1. **Carefully scan the chapter content for LaTeX mathematical formulas enclosed in double dollar signs ($$...$$).**
            2. **Extract ONLY the LaTeX content between the double dollar signs and include them in the "latex" field as a list of strings.**
            3. **For each slide, if no LaTeX formulas are found in the relevant content, provide an empty array for the "latex" field.**
            4. **DO NOT include the double dollar signs ($$) themselves, only extract the LaTeX formula content.**
            5. **Examples of what to extract:**
               - $$E = mc^2$$ → extract "E = mc^2"
               - $$\\frac{{a}}{{b}} = c$$ → extract "\\frac{{a}}{{b}} = c"
               - $$\\sum_{{i=1}}^{{n}} x_i$$ → extract "\\sum_{{i=1}}^{{n}} x_i"

            **CHART TYPE RECOMMENDATION WITH REASONING**:
            1. **Analyze each slide content and select the most appropriate chart type from: Flowchart, Bar Chart, Pie Chart, Line Chart, Scatter Plot, Organization Chart, Mind Map, Concept Map, Timeline, Table, Image/Diagram, or No Chart.**
            2. **First extract entities from the content, then determine logical relationships, and generate a detailed prompt:**
               - Extract all relevant data points, entities, and key concepts from the slide content
               - Analyze the logical relationships between these entities (comparisons, processes, hierarchies, trends, etc.)
               - Generate a comprehensive prompt that combines the entities and their logical relationships
               - Include specific formatting requirements (column names, visual styles, layout)
               - Provide clear labels, organizational structure, and professional presentation standards
            3. **Example formats:**
               - Table: "A business summary table listing the key performance indicators(KPIs) for five departments: Sales, Marketing, Operations, Finance, and HR. The columns should be: 'Department', 'Budget (in USD)', 'Actual Spend (in USD)', 'Variance (%)', and 'Performance Rating'. Fill in realistic numbers for each cell. The table should use alternating row shading and have bold headers. Include a footer row showing total budget and spend."
               - Flowchart: "A flowchart illustrating the decision-making process for launching a new product in the market. The flow starts with 'Market Research', followed by a decision node 'Is there sufficient demand?'. If yes, the path continues to 'Develop Prototype', 'Conduct User Testing', and then 'Finalize Product Design'. If no, the path leads to 'Re-evaluate Market Strategy'. The flowchart should include labeled arrows and distinct shapes: rectangles for actions, diamonds for decisions."

            **TONE**
            Maintain a formal, academic tone. Focus on novel findings and preserve quantitative results.
            Avoid redundant information and introductory content unless essential.

            **OUTPUT**
            Generate exactly {target_pages} slides, each with exactly {num_of_bullets} bullet points.
            Each point should be concise but informative, within {words_each_bullet} words.
            Each slide must include a "latex" field containing an array of LaTeX formulas found in the relevant content.
            Each slide must include a "chart_type" field with a recommended chart type based on the slide content.
            Each slide must include a "chart_reasoning" field with ONE complete, detailed prompt sentence for chart generation.
        '''

    async def fetch_data(self, session, data):
        try:
            async with session.post(self.url, json=data, headers=self.headers, ssl=False, timeout=aiohttp.ClientTimeout(total=90)) as response:
                response.raise_for_status()
                return await response.json()
        except aiohttp.ClientError as e:
            print(f"Request failed: {e}")
            return {"_error": str(e)}
        except asyncio.TimeoutError:
            print("Request timed out")
            return {"_error": "timeout"}

    def _calculate_initial_points(self, highlights_data, total_pages):
        """计算每个章节应该分配的页数"""
        total_chapters = len(highlights_data)
        print(f"\n=== Initial Calculation ===")
        print(f"Total chapters: {total_chapters}")
        print(f"Target total pages: {total_pages}")
        
        # 计算每个章节的权重
        chapter_weights = []
        print("\n=== Chapter Weight Calculation ===")
        for item in highlights_data:
            # 基础权重：章节内容长度
            content_length = len(item['text'])
            
            # 根据章节标题判断重要性
            title = item['sectionTitle'].lower()
            importance_weight = 1.0
            
            # 方法、结果、结论等章节通常更重要
            if any(keyword in title for keyword in ['method', 'result', 'conclusion', 'discussion']):
                importance_weight = 1.5
                print(f"Chapter '{item['sectionTitle']}' is identified as an important chapter, weight: 1.5")
            # 引言、背景等章节可以相对简略
            elif any(keyword in title for keyword in ['introduction', 'background', 'related work']):
                importance_weight = 0.8
                print(f"Chapter '{item['sectionTitle']}' is identified as a secondary chapter, weight: 0.8")
            else:
                print(f"Chapter '{item['sectionTitle']}' uses default weight: 1.0")
            
            # 计算最终权重
            weight = content_length * importance_weight
            chapter_weights.append(weight)
            print(f"Chapter '{item['sectionTitle']}' content length: {content_length}, final weight: {weight:.2f}")
        
        # 归一化权重
        total_weight = sum(chapter_weights)
        normalized_weights = [w / total_weight for w in chapter_weights]
        
        print("\n=== Normalized Weights ===")
        for i, (item, norm_weight) in enumerate(zip(highlights_data, normalized_weights)):
            print(f"Chapter '{item['sectionTitle']}' normalized weight: {norm_weight:.2%}")
        
        # 初始化页数分配
        pages_distribution = [1] * total_chapters  # 每个章节至少1页
        remaining_pages = total_pages - total_chapters
        
        print(f"\n=== Initial Allocation ===")
        print(f"Each chapter gets at least 1 page, remaining pages to allocate: {remaining_pages}")
        
        # 迭代分配剩余页数，确保不超过3页限制
        while remaining_pages > 0:
            # 计算当前可以继续分配页数的章节
            available_chapters = [i for i in range(total_chapters) if pages_distribution[i] < 3]
            
            if not available_chapters:
                print("All chapters have reached the 3-page limit, stop allocation")
                break
            
            # 重新计算可分配章节的权重
            available_weights = [normalized_weights[i] for i in available_chapters]
            total_available_weight = sum(available_weights)
            
            if total_available_weight == 0:
                # 如果权重都为0，平均分配
                pages_to_assign = min(remaining_pages, len(available_chapters))
                for i in range(pages_to_assign):
                    chapter_idx = available_chapters[i]
                    pages_distribution[chapter_idx] += 1
                    remaining_pages -= 1
                    print(f"Average allocation: Chapter '{highlights_data[chapter_idx]['sectionTitle']}' gets 1 more page")
            else:
                # 按权重分配
                normalized_available_weights = [w / total_available_weight for w in available_weights]
                
                # 计算每个可用章节应得的额外页数
                extra_pages_float = [weight * remaining_pages for weight in normalized_available_weights]
                extra_pages = [int(pages) for pages in extra_pages_float]
                
                # 处理舍入误差
                assigned_pages = sum(extra_pages)
                if assigned_pages < remaining_pages:
                    # 按小数部分排序，优先分配给小数部分大的章节
                    fractional_parts = [(extra_pages_float[i] - extra_pages[i], i) 
                                      for i in range(len(extra_pages))]
                    fractional_parts.sort(reverse=True)  # 按小数部分降序排序
                    
                    for j in range(remaining_pages - assigned_pages):
                        if j < len(fractional_parts):
                            idx_in_available = fractional_parts[j][1]
                            extra_pages[idx_in_available] += 1
                
                # 分配额外页数，但不超过3页限制
                pages_assigned_this_round = 0
                for i, chapter_idx in enumerate(available_chapters):
                    max_can_assign = min(extra_pages[i], 3 - pages_distribution[chapter_idx])
                    if max_can_assign > 0:
                        pages_distribution[chapter_idx] += max_can_assign
                        pages_assigned_this_round += max_can_assign
                        print(f"Chapter '{highlights_data[chapter_idx]['sectionTitle']}' gets {max_can_assign} more pages")
                
                remaining_pages -= pages_assigned_this_round
                
                # 如果这轮没有分配任何页数，说明所有可用章节都已达到限制
                if pages_assigned_this_round == 0:
                    print("All available chapters have reached the limit, stop allocation")
                    break
        
        # 最终检查和调整
        actual_total = sum(pages_distribution)
        print(f"\n=== Allocation Check ===")
        print(f"Actual allocated total pages: {actual_total}")
        print(f"Target total pages: {total_pages}")
        print(f"Unallocated pages: {remaining_pages}")
        
        # 如果还有未分配的页数，尝试最后的平均分配
        if remaining_pages > 0:
            print(f"\n=== Final Average Allocation ===")
            available_chapters = [i for i in range(total_chapters) if pages_distribution[i] < 3]
            for i in range(min(remaining_pages, len(available_chapters))):
                chapter_idx = available_chapters[i]
                pages_distribution[chapter_idx] += 1
                print(f"Final allocation: Chapter '{highlights_data[chapter_idx]['sectionTitle']}' gets 1 more page")
        
        print("\n=== Final Allocation Results ===")
        final_total = sum(pages_distribution)
        for i, (item, pages) in enumerate(zip(highlights_data, pages_distribution)):
            print(f"Chapter '{item['sectionTitle']}' allocated pages: {pages}")
        print(f"Final total pages: {final_total}")
        
        return pages_distribution

    async def _summarize_with_points(self, highlights_data, pages_distribution, num_of_bullets=3, words_each_bullet=25):
        """使用指定的页数进行总结"""
        data_list = [{
            "model": "deepseek-chat",
            "messages": [
                {
                    "role": "system",
                    "content": self.system_prompt
                },
                {
                    "role": "user",
                    "content": self._get_prompt(
                        pages_distribution[i],
                        i,
                        len(highlights_data),
                        num_of_bullets,
                        words_each_bullet
                    ) + f"\nChapter Title: {item['sectionTitle']}\nContent: {item['text']}"
                }
            ],
            "stream": False,
            "max_tokens": 1000,
            "temperature": 0.5
        } for i, item in enumerate(highlights_data)]


        final_results = []
        current_slide_number = 1
        failed_chapters = []
        
        async with aiohttp.ClientSession() as session:
            tasks = [self.fetch_data(session, data) for data in data_list]
            results = await asyncio.gather(*tasks)
            
            for i, result in enumerate(results):
                target_pages = pages_distribution[i]
                chapter_title = highlights_data[i].get('sectionTitle', f'Chapter {i+1}')
                
                if result and "_error" not in result:
                    try:
                        output_str = result['choices'][0]['message']['content'].strip('```json\n').strip('```')
                        output_dict = json.loads(output_str)
                        
                        # 处理每个章节的幻灯片
                        for slide in output_dict['slides']:
                            slide['slide_number'] = current_slide_number
                            slide['_status'] = 'success'
                            current_slide_number += 1
                            final_results.append(slide)
                        
                    except (KeyError, json.JSONDecodeError) as e:
                        print(f"Error processing chapter {i+1} result: {e}")
                        failed_chapters.append(chapter_title)
                        # Generate placeholder slides for the failed chapter
                        for p in range(target_pages):
                            final_results.append({
                                "slide_number": current_slide_number,
                                "title": f"{chapter_title}" if p == 0 else f"{chapter_title} (cont.)",
                                "content": ["[Content generation failed — please retry this chapter]"],
                                "latex": [],
                                "chart_type": "No Chart",
                                "chart_reasoning": [],
                                "_status": "failed",
                                "_error": f"parse_error: {e}"
                            })
                            current_slide_number += 1
                else:
                    error_msg = result.get("_error", "unknown") if result else "no_response"
                    print(f"Chapter {i+1} '{chapter_title}' failed: {error_msg}")
                    failed_chapters.append(chapter_title)
                    for p in range(target_pages):
                        final_results.append({
                            "slide_number": current_slide_number,
                            "title": f"{chapter_title}" if p == 0 else f"{chapter_title} (cont.)",
                            "content": ["[Content generation failed — please retry this chapter]"],
                            "latex": [],
                            "chart_type": "No Chart",
                            "chart_reasoning": [],
                            "_status": "failed",
                            "_error": error_msg
                        })
                        current_slide_number += 1

        if failed_chapters:
            print(f"⚠️ {len(failed_chapters)}/{len(highlights_data)} chapters failed: {failed_chapters}")
        
        return final_results

    async def summarize_chapters(self, highlights_data, total_pages, num_of_bullets=3, words_each_bullet=25):
        # 使用初始计算的页数进行总结
        pages_distribution = self._calculate_initial_points(highlights_data, total_pages)
        results = await self._summarize_with_points(highlights_data, pages_distribution, num_of_bullets, words_each_bullet)
        
        # 验证结果
        total_slides = len(results)
        print(f"\n=== Final Results ===")
        print(f"Generated pages: {total_slides}")
        print(f"Target pages: {total_pages}")
        
        if total_slides != total_pages:
            print(f"Warning: Generated pages ({total_slides}) != Target pages ({total_pages})")
            print("This should not happen with proper frontend constraints")
        
        return results

    def summarize(self, highlights_data, total_pages, num_of_bullets=3, words_each_bullet=25):
        """同步方法，用于在Flask路由中调用"""
        return asyncio.run(self.summarize_chapters(highlights_data, total_pages, num_of_bullets, words_each_bullet))

    async def generate_talking_script(self, slides_results, script_style="academic", provider="local_ollama"):
        """
        基于总结内容生成talking script，批量处理以节省API调用
        
        Args:
            slides_results: 从summarize方法返回的幻灯片结果
            script_style: 演讲风格 ("academic", "casual", "business")
        """
        # 每批处理4个幻灯片，减少API调用次数
        batch_size = 4
        batches = [slides_results[i:i + batch_size] for i in range(0, len(slides_results), batch_size)]
        
        style_prompts = {
            "academic": "Use formal academic language with appropriate pauses and emphasis. The tone should be professional but not boring.",
            "casual": "Use relaxed and friendly language with natural transitions and interactive elements.",
            "business": "Use concise professional business language, highlighting key information and action points."
        }
        
        system_prompt = f'''
        You are a professional speech script writer specializing in creating natural and fluent talking scripts for academic and business presentations.

        Requirements:
        1. {style_prompts.get(script_style, style_prompts["academic"])}
        2. Each script should be timed for 30-60 seconds of speaking
        3. Include natural transitions and connections between slides
        4. Add speaking cues: [PAUSE] for pauses, [EMPHASIS] for emphasis, [SLOW] for slower delivery
        5. Structure each script with introduction, main content, and conclusion sections

        Output the response in the following JSON format:
        {{
            "scripts": [
                {{
                    "slide_number": 1,
                    "slide_title": "Title of slide",
                    "introduction": "Brief opening for the slide topic...",
                    "main_content": "Detailed explanation covering all key points...",
                    "conclusion": "Summary or transition statement...",
                    "estimated_duration": "45-60 seconds"
                }}
            ]
        }}

        IMPORTANT: 
        - Generate scripts for ALL slides provided in the request
        - Each script should have clear introduction, main content, and conclusion sections
        - Match the slide_number and slide_title exactly with the input data
        - Ensure the JSON is valid and properly formatted
        '''
        
        data_list = []
        for batch_idx, batch in enumerate(batches):
            batch_content = f"Please generate talking scripts for the following {len(batch)} slides in JSON format:\n\n"
            for slide in batch:
                batch_content += f"Slide {slide['slide_number']}: {slide['title']}\n"
                batch_content += "Key Points to Cover:\n"
                for point in slide['content']:
                    batch_content += f"• {point}\n"
                batch_content += "\n"
            
            batch_content += "Please provide the talking scripts in the specified JSON format."
            
            data_list.append({
                "system_prompt": system_prompt,
                "batch_content": batch_content,
            })
        
        # 并行处理所有批次
        final_scripts = []
        from backend.services.ai_gateway_service import AIGatewayService
        ai_service = AIGatewayService()

        async def _run_batch(data):
            async with self._semaphore:
                try:
                    content = await ai_service.chat_with_provider(
                        message=data["batch_content"],
                        context={"system_override": data["system_prompt"]},
                        provider=provider,
                    )
                    return {"choices": [{"message": {"content": content}}]}
                except Exception as e:
                    return {"_error": str(e)}

        results = await asyncio.gather(*[_run_batch(data) for data in data_list])

        for batch_idx, result in enumerate(results):
            batch = batches[batch_idx]
            if not result or "_error" in result:
                print(f"❌ Script generation failed for batch {batch_idx}: {result.get('_error', 'unknown_error') if isinstance(result, dict) else 'unknown_error'}")
                for slide in batch:
                    final_scripts.append(self._build_fallback_script_data(slide, script_style))
                continue

            script_content = ""
            try:
                script_content = str(result['choices'][0]['message']['content'] or "").strip()

                # 兼容 ```json ...``` 或夹杂说明文字的响应
                fenced_match = re.search(r"```(?:json)?\s*(\{[\s\S]*\})\s*```", script_content, flags=re.IGNORECASE)
                if fenced_match:
                    script_content = fenced_match.group(1).strip()
                else:
                    brace_start = script_content.find("{")
                    brace_end = script_content.rfind("}")
                    if brace_start >= 0 and brace_end > brace_start:
                        script_content = script_content[brace_start:brace_end + 1]

                json_response = json.loads(script_content)
                scripts_list = json_response.get('scripts', [])
                if not isinstance(scripts_list, list):
                    scripts_list = []

                processed_numbers = set()

                for idx, script_item in enumerate(scripts_list):
                    if not isinstance(script_item, dict):
                        continue

                    raw_slide_number = script_item.get('slide_number')
                    slide_number = self._normalize_slide_number(raw_slide_number)

                    original_slide = None
                    if slide_number is not None:
                        for slide in batch:
                            if self._normalize_slide_number(slide.get('slide_number')) == slide_number:
                                original_slide = slide
                                break

                    # 兜底1: 按标题匹配
                    if original_slide is None:
                        model_title = str(script_item.get('slide_title', '') or '').strip().lower()
                        if model_title:
                            for slide in batch:
                                if str(slide.get('title', '') or '').strip().lower() == model_title:
                                    original_slide = slide
                                    slide_number = self._normalize_slide_number(slide.get('slide_number'))
                                    break

                    # 兜底2: 按返回顺序映射
                    if original_slide is None and idx < len(batch):
                        original_slide = batch[idx]
                        slide_number = self._normalize_slide_number(original_slide.get('slide_number'))

                    if not original_slide or slide_number is None:
                        continue

                    intro = str(script_item.get('introduction', '') or '').strip()
                    main_content = script_item.get('main_content', '')
                    if isinstance(main_content, list):
                        main_content_text = "\n\n".join(str(x or '').strip() for x in main_content if str(x or '').strip())
                        main_body = [str(x or '').strip() for x in main_content if str(x or '').strip()]
                    else:
                        main_content_text = str(main_content or '').strip()
                        main_body = [main_content_text] if main_content_text else []
                    conclusion = str(script_item.get('conclusion', '') or '').strip()

                    full_script = "\n\n".join([part for part in [intro, main_content_text, conclusion] if part]).strip()
                    if not full_script:
                        fallback = self._build_fallback_script_data(original_slide, script_style)
                        final_scripts.append(fallback)
                        processed_numbers.add(slide_number)
                        continue

                    script_data = {
                        'slide_number': slide_number,
                        'slide_title': script_item.get('slide_title', original_slide['title']),
                        'slide_content_points': original_slide['content'],
                        'talking_script': {
                            'intro': intro,
                            'main_body': main_body,
                            'conclusion': conclusion,
                            'full_text': full_script
                        },
                        'estimated_duration': script_item.get('estimated_duration', '45-60 seconds'),
                        'script_style': script_style,
                        'word_count': len(full_script.split()),
                        'speaking_cues': self._extract_speaking_cues(full_script)
                    }
                    final_scripts.append(script_data)
                    processed_numbers.add(slide_number)
                    print(f"✅ Processed script for slide {slide_number}: {script_item.get('slide_title', 'Unknown')}")

                # 补齐当前批次中模型漏掉的幻灯片
                for slide in batch:
                    s_no = self._normalize_slide_number(slide.get('slide_number'))
                    if s_no is None or s_no in processed_numbers:
                        continue
                    print(f"⚠️ Missing script for slide {s_no}, using fallback script")
                    final_scripts.append(self._build_fallback_script_data(slide, script_style))

            except (KeyError, json.JSONDecodeError, TypeError, ValueError) as e:
                print(f"❌ Error processing script result for batch {batch_idx}: {e}")
                print(f"Raw content: {script_content[:200]}...")
                for slide in batch:
                    final_scripts.append(self._build_fallback_script_data(slide, script_style))
        
        # 按slide_number排序，确保顺序正确
        final_scripts.sort(key=lambda x: x['slide_number'])
        return final_scripts

    def _process_script_content(self, raw_script):
        """处理原始演讲稿内容，提取段落和格式信息"""
        # 分割成段落
        paragraphs = [p.strip() for p in raw_script.split('\n\n') if p.strip()]
        
        processed_content = {
            'intro': '',
            'main_body': [],
            'conclusion': '',
            'full_text': raw_script
        }
        
        if paragraphs:
            # 第一段作为介绍
            processed_content['intro'] = paragraphs[0]
            
            # 中间段落作为主体
            if len(paragraphs) > 2:
                processed_content['main_body'] = paragraphs[1:-1]
                processed_content['conclusion'] = paragraphs[-1]
            elif len(paragraphs) == 2:
                processed_content['conclusion'] = paragraphs[1]
            else:
                # 只有一段的情况
                processed_content['main_body'] = [paragraphs[0]]
                processed_content['intro'] = ''
        
        return processed_content

    def _extract_speaking_cues(self, script):
        """提取演讲提示cues"""
        cues = {
            'pauses': script.count('[PAUSE]'),
            'emphasis': script.count('[EMPHASIS]'),
            'slow_delivery': script.count('[SLOW]'),
            'total_cues': 0
        }
        cues['total_cues'] = cues['pauses'] + cues['emphasis'] + cues['slow_delivery']
        return cues

    def _normalize_slide_number(self, value):
        try:
            return int(str(value).strip())
        except (TypeError, ValueError, AttributeError):
            return None

    def _build_fallback_script_data(self, slide, script_style):
        slide_number = self._normalize_slide_number(slide.get('slide_number')) or 0
        title = str(slide.get('title', f'Slide {slide_number}') or f'Slide {slide_number}')
        points = [str(p or '').strip() for p in (slide.get('content') or []) if str(p or '').strip()]
        intro = f"This slide introduces {title}."
        main_body = [f"Key point: {p}" for p in points] if points else ["Please explain the core idea shown on this slide."]
        conclusion = "In summary, this slide highlights the essential points to remember."
        full_script = "\n\n".join([intro] + main_body + [conclusion])
        return {
            'slide_number': slide_number,
            'slide_title': title,
            'slide_content_points': points,
            'talking_script': {
                'intro': intro,
                'main_body': main_body,
                'conclusion': conclusion,
                'full_text': full_script,
            },
            'estimated_duration': '45-60 seconds',
            'script_style': script_style,
            'word_count': len(full_script.split()),
            'speaking_cues': self._extract_speaking_cues(full_script),
        }

    def generate_script_sync(self, slides_results, script_style="academic"):
        """同步方法，用于在Flask路由中调用"""
        return asyncio.run(self.generate_talking_script(slides_results, script_style))
