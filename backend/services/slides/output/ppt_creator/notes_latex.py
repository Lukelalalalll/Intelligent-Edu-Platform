from __future__ import annotations


class NotesLatexMixin:
    def _apply_speaker_notes(self, slide, slide_data):
        self.ppt_utils.apply_speaker_notes(slide, slide_data)

    def _process_latex_formulas(self, slide, slide_data):
        slide_id = f"slide_{slide_data.get('slide_number', 'unknown')}"
        formula_images = self.LatexRenderer.process_slide_latex(slide_data, slide_id)
        if formula_images:
            self._insert_latex_images(slide, formula_images)

    def _insert_latex_images(self, slide, formula_images):
        self.LatexRenderer.insert_latex_images(
            slide,
            formula_images,
            insert_picture_fn=self._insert_picture_with_aspect_ratio,
        )

    def _collect_other_placeholders(self, slide):
        return self.LatexRenderer._collect_other_placeholders(slide)

    def _insert_picture_with_aspect_ratio(self, slide, placeholder_shape, image_path, left, top, width, height):
        self.ppt_utils.insert_picture_with_aspect_ratio(slide, placeholder_shape, image_path, left, top, width, height)
