from __future__ import annotations


def calculate_initial_points(highlights_data: list[dict], total_pages: int) -> list[int]:
    total_chapters = len(highlights_data)
    chapter_weights: list[float] = []
    for item in highlights_data:
        content_length = len(item["text"])
        title = item["sectionTitle"].lower()
        importance_weight = 1.0
        if any(keyword in title for keyword in ["method", "result", "conclusion", "discussion"]):
            importance_weight = 1.5
        elif any(keyword in title for keyword in ["introduction", "background", "related work"]):
            importance_weight = 0.8
        chapter_weights.append(content_length * importance_weight)

    total_weight = sum(chapter_weights) or 1.0
    normalized_weights = [weight / total_weight for weight in chapter_weights]
    pages_distribution = [1] * total_chapters
    remaining_pages = total_pages - total_chapters

    while remaining_pages > 0:
        available = [index for index in range(total_chapters) if pages_distribution[index] < 3]
        if not available:
            break
        available_weights = [normalized_weights[index] for index in available]
        total_available_weight = sum(available_weights)

        if total_available_weight == 0:
            for chapter_index in available[:remaining_pages]:
                pages_distribution[chapter_index] += 1
                remaining_pages -= 1
            continue

        normalized_available_weights = [
            weight / total_available_weight for weight in available_weights
        ]
        extra_pages_float = [weight * remaining_pages for weight in normalized_available_weights]
        extra_pages = [int(pages) for pages in extra_pages_float]
        assigned_pages = sum(extra_pages)
        if assigned_pages < remaining_pages:
            fractional_parts = sorted(
                (
                    extra_pages_float[index] - extra_pages[index],
                    index,
                )
                for index in range(len(extra_pages))
            )
            fractional_parts.reverse()
            for offset in range(remaining_pages - assigned_pages):
                if offset < len(fractional_parts):
                    extra_pages[fractional_parts[offset][1]] += 1

        pages_assigned_this_round = 0
        for index, chapter_index in enumerate(available):
            max_assignable = min(extra_pages[index], 3 - pages_distribution[chapter_index])
            if max_assignable > 0:
                pages_distribution[chapter_index] += max_assignable
                pages_assigned_this_round += max_assignable

        remaining_pages -= pages_assigned_this_round
        if pages_assigned_this_round == 0:
            break

    if remaining_pages > 0:
        available = [index for index in range(total_chapters) if pages_distribution[index] < 3]
        for chapter_index in available[:remaining_pages]:
            pages_distribution[chapter_index] += 1

    return pages_distribution
