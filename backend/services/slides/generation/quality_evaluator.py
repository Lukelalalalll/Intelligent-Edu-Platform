"""
Sub1 Pipeline Quality Evaluator — Automated quality assessment for PPT generation.

Evaluates:
1. Coverage: Do slides cover all key highlights?
2. Consistency: Are bullet points consistent in style and length?
3. Readability: Word count, sentence complexity
4. Hallucination: Does slide content stay grounded in source highlights?
5. Structural: Are titles unique? Are charts reasoning present?

Usage:
    evaluator = PipelineEvaluator()
    report = evaluator.evaluate(
        highlights=original_highlights,
        slides=generated_slides,
    )
    print(report["overall_score"])
"""
from __future__ import annotations

import re
from typing import Any


class PipelineEvaluator:
    """Evaluate the quality of generated slides against source highlights."""

    @staticmethod
    def _get_bullets(slide: dict) -> list[str]:
        """Extract bullet points from a slide, checking common field names."""
        return slide.get("content") or slide.get("bullet_points") or []

    def evaluate(
        self,
        highlights: list[dict[str, Any]],
        slides: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """
        Run all quality checks.

        Args:
            highlights: original highlight data (flat list with 'text' field)
            slides: generated slide dicts with 'title', 'content', etc.

        Returns:
            Comprehensive quality report
        """
        coverage = self._check_coverage(highlights, slides)
        consistency = self._check_consistency(slides)
        readability = self._check_readability(slides)
        hallucination = self._check_hallucination(highlights, slides)
        structural = self._check_structural(slides)

        scores = [
            coverage["score"],
            consistency["score"],
            readability["score"],
            hallucination["score"],
            structural["score"],
        ]
        overall = round(sum(scores) / len(scores), 1)

        return {
            "overall_score": overall,
            "coverage": coverage,
            "consistency": consistency,
            "readability": readability,
            "hallucination": hallucination,
            "structural": structural,
            "total_slides": len(slides),
            "total_highlights": len(highlights),
            "pass": overall >= 70.0,
        }

    def _check_coverage(self, highlights: list, slides: list) -> dict:
        """Check how well slides cover the original highlights."""
        if not highlights:
            return {"score": 100.0, "detail": "No highlights to check"}

        highlight_texts = [h.get("text", "").lower() for h in highlights if h.get("text")]
        slide_text = " ".join(
            " ".join(self._get_bullets(s)) + " " + s.get("title", "")
            for s in slides
        ).lower()

        covered = 0
        uncovered_highlights = []
        for i, ht in enumerate(highlight_texts):
            # Check if key terms from the highlight appear in slides
            words = set(re.findall(r'\b\w{4,}\b', ht))  # 4+ char words
            if not words:
                covered += 1
                continue
            matched = sum(1 for w in words if w in slide_text)
            ratio = matched / len(words)
            if ratio >= 0.3:  # At least 30% of key words found
                covered += 1
            else:
                uncovered_highlights.append(i)

        coverage_pct = (covered / len(highlight_texts)) * 100
        return {
            "score": round(coverage_pct, 1),
            "covered": covered,
            "total": len(highlight_texts),
            "uncovered_indices": uncovered_highlights[:10],
        }

    def _check_consistency(self, slides: list) -> dict:
        """Check bullet point consistency across slides."""
        if not slides:
            return {"score": 100.0, "detail": "No slides"}

        bullet_lengths = []
        bullet_counts = []
        for s in slides:
            content = self._get_bullets(s)
            bullet_counts.append(len(content))
            for bullet in content:
                bullet_lengths.append(len(bullet.split()))

        if not bullet_lengths:
            return {"score": 50.0, "detail": "No bullets found"}

        avg_len = sum(bullet_lengths) / len(bullet_lengths)
        variance = sum((l - avg_len) ** 2 for l in bullet_lengths) / len(bullet_lengths)
        std_dev = variance ** 0.5
        cv = std_dev / avg_len if avg_len > 0 else 0

        # Lower CV = more consistent. Score = 100 - (CV * 100), clamped 0-100
        score = max(0, min(100, 100 - cv * 100))

        return {
            "score": round(score, 1),
            "avg_bullet_words": round(avg_len, 1),
            "std_dev_words": round(std_dev, 1),
            "coefficient_of_variation": round(cv, 3),
            "bullet_counts_per_slide": bullet_counts,
        }

    def _check_readability(self, slides: list) -> dict:
        """Check readability: word count, bullet density."""
        issues = []
        total_bullets = 0
        for i, s in enumerate(slides):
            content = self._get_bullets(s)
            total_bullets += len(content)
            for j, bullet in enumerate(content):
                wc = len(bullet.split())
                if wc > 30:
                    issues.append(f"Slide {i+1} bullet {j+1}: too long ({wc} words)")
                if wc < 3:
                    issues.append(f"Slide {i+1} bullet {j+1}: too short ({wc} words)")
            if len(content) > 6:
                issues.append(f"Slide {i+1}: too many bullets ({len(content)})")

        score = max(0, 100 - len(issues) * 10)
        return {
            "score": min(100, round(score, 1)),
            "total_bullets": total_bullets,
            "issues": issues[:10],
        }

    def _check_hallucination(self, highlights: list, slides: list) -> dict:
        """
        Basic hallucination check: are there slide content phrases
        that have no grounding in the source highlights?
        """
        if not highlights or not slides:
            return {"score": 80.0, "detail": "Insufficient data for hallucination check"}

        source_text = " ".join(h.get("text", "") for h in highlights).lower()
        source_words = set(re.findall(r'\b\w{5,}\b', source_text))

        ungrounded = 0
        total_claims = 0
        for s in slides:
            for bullet in self._get_bullets(s):
                total_claims += 1
                bullet_words = set(re.findall(r'\b\w{5,}\b', bullet.lower()))
                if not bullet_words:
                    continue
                grounded = len(bullet_words & source_words) / len(bullet_words)
                if grounded < 0.2:  # Less than 20% overlap
                    ungrounded += 1

        if total_claims == 0:
            return {"score": 80.0, "detail": "No claims to check"}

        grounded_pct = ((total_claims - ungrounded) / total_claims) * 100
        return {
            "score": round(grounded_pct, 1),
            "total_claims": total_claims,
            "ungrounded_claims": ungrounded,
        }

    def _check_structural(self, slides: list) -> dict:
        """Check structural quality: unique titles, chart reasoning presence."""
        issues = []
        titles = [s.get("title", "") for s in slides]
        unique_titles = set(titles)
        if len(unique_titles) < len(titles):
            dup_count = len(titles) - len(unique_titles)
            issues.append(f"{dup_count} duplicate titles found")

        for i, s in enumerate(slides):
            if not s.get("title"):
                issues.append(f"Slide {i+1}: missing title")
            ct = s.get("chart_type", "No Chart")
            if ct and ct != "No Chart" and not s.get("chart_reasoning"):
                issues.append(f"Slide {i+1}: chart_type='{ct}' but no chart_reasoning")
            if s.get("_status") == "failed":
                issues.append(f"Slide {i+1}: generation failed")

        score = max(0, 100 - len(issues) * 15)
        return {
            "score": min(100, round(score, 1)),
            "unique_titles": len(unique_titles),
            "total_titles": len(titles),
            "issues": issues[:10],
        }


def evaluate_pipeline_run(
    highlights: list[dict],
    slides: list[dict],
) -> dict[str, Any]:
    """Convenience function for quick evaluation."""
    evaluator = PipelineEvaluator()
    return evaluator.evaluate(highlights, slides)
