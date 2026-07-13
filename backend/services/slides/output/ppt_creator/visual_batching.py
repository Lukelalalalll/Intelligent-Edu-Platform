from __future__ import annotations

import asyncio


class VisualBatchingMixin:
    def start_collecting(self):
        self._ctx.start_collecting()
        self.collected_tasks = self._ctx.collected_tasks
        self.is_collecting = self._ctx.is_collecting
        self.batch_results = self._ctx.batch_results

    def stop_collecting(self):
        self._ctx.stop_collecting()
        self.is_collecting = self._ctx.is_collecting

    async def process_all_collected_tasks(self):
        if not self.collected_tasks:
            print("ℹ️ [Batch Processing] No collected tasks to process")
            return

        print(f"🚀 [Batch Processing] Starting batch processing of {len(self.collected_tasks)} collected tasks...")
        all_image_data = []
        task_mappings = []

        for task_idx, task_info in enumerate(self.collected_tasks):
            slide_data = task_info["slide_data"]
            placeholder_infos = task_info["placeholder_infos"]
            slide_title = task_info["slide_title"]

            for placeholder_idx, placeholder_info in enumerate(placeholder_infos):
                image_data = self._prepare_image_data(slide_data, placeholder_info, placeholder_idx)
                all_image_data.append(image_data)
                task_mappings.append(
                    {
                        "task_idx": task_idx,
                        "placeholder_idx": placeholder_idx,
                        "slide_title": slide_title,
                    }
                )

        total_count = len(all_image_data)
        print(f"⚡ [Batch Processing] Processing {total_count} image placeholders in parallel...")
        self.batch_results = await self.image_processor.process_multiple_images_async(all_image_data)
        print(f"✅ [Batch Processing] Batch processing completed! Generated {len(self.batch_results)} images")
        await self._apply_batch_results(task_mappings)

    async def _apply_batch_results(self, task_mappings):
        print(f"📌 [Batch Processing] Applying {len(self.batch_results)} results to placeholders...")
        applied_count = 0
        error_count = 0

        for result_idx, (image_path, mapping) in enumerate(zip(self.batch_results, task_mappings)):
            try:
                task_info = self.collected_tasks[mapping["task_idx"]]
                slide = task_info["slide"]
                placeholder_info = task_info["placeholder_infos"][mapping["placeholder_idx"]]
                slide_title = mapping["slide_title"]

                if image_path:
                    self._insert_picture_into_placeholder(slide, placeholder_info["shape"], image_path)
                    applied_count += 1
                    print(f"✅ [Batch Processing] Applied result {result_idx + 1}/{len(self.batch_results)} to slide: {slide_title}")
                else:
                    print(f"⚠️ [Batch Processing] No image generated for result {result_idx + 1} in slide: {slide_title}")
            except Exception as exc:
                error_count += 1
                print(f"❌ [Batch Processing] Error applying result {result_idx + 1}: {exc}")

        print(f"🎉 [Batch Processing] Batch application completed! Applied: {applied_count}, Errors: {error_count}")

    def _prepare_image_data(self, slide_data, placeholder_info, placeholder_index):
        return self.ppt_utils.prepare_image_data(slide_data, placeholder_info, placeholder_index)

    def _collect_visual_tasks(self, slide, slide_data: dict, *, content_was_handled: bool = True):
        chart_type = slide_data.get("chart_type", "")
        slide_title = slide_data.get("title", "Unknown")
        placeholder_infos: list = []

        for shape in slide.shapes:
            if not shape.is_placeholder:
                continue
            placeholder_type = shape.placeholder_format.type

            if placeholder_type == 18:
                aspect_ratio = shape.width / shape.height
                if abs(aspect_ratio - 1.778) < 0.1:
                    ratio = 1
                elif abs(aspect_ratio - 1.333) < 0.1:
                    ratio = 0
                else:
                    continue
                placeholder_infos.append(
                    {
                        "shape": shape,
                        "left": shape.left,
                        "top": shape.top,
                        "width": shape.width,
                        "height": shape.height,
                        "placeholder_type": placeholder_type,
                        "aspect_ratio": aspect_ratio,
                        "ratio": ratio,
                        "image_type": "image",
                    }
                )
            elif placeholder_type == 7:
                if content_was_handled and not self._is_meaningful_chart_type(chart_type):
                    continue
                aspect_ratio = shape.width / shape.height
                if abs(aspect_ratio - 1.778) < 0.1:
                    ratio = 1
                elif abs(aspect_ratio - 1.333) < 0.1:
                    ratio = 0
                else:
                    continue
                placeholder_infos.append(
                    {
                        "shape": shape,
                        "left": shape.left,
                        "top": shape.top,
                        "width": shape.width,
                        "height": shape.height,
                        "placeholder_type": placeholder_type,
                        "aspect_ratio": aspect_ratio,
                        "ratio": ratio,
                        "image_type": "diagram",
                    }
                )

        if not placeholder_infos:
            return

        print(f'🔍 [Visual] {len(placeholder_infos)} visual placeholder(s) in: "{slide_title}"')
        if self.is_collecting:
            self.collected_tasks.append(
                {
                    "slide": slide,
                    "slide_data": slide_data,
                    "placeholder_infos": placeholder_infos,
                    "slide_title": slide_title,
                }
            )
            print(f'📦 [Batch] Collected visual task for: "{slide_title}"')
            return

        image_data_list = [
            self._prepare_image_data(slide_data, placeholder_info, index)
            for index, placeholder_info in enumerate(placeholder_infos)
        ]
        print(f"🚀 [Visual] Processing {len(placeholder_infos)} placeholder(s) immediately...")
        image_paths = asyncio.run(self.image_processor.process_multiple_images_async(image_data_list))
        for placeholder_info, image_path in zip(placeholder_infos, image_paths):
            if image_path:
                self._insert_picture_into_placeholder(slide, placeholder_info["shape"], image_path)
