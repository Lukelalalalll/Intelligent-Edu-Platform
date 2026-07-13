from __future__ import annotations

import pytest

from backend.services.slides.output.business_ppt_creator import BusinessPPTCreator


def test_business_ppt_creator_builds_business_template_path(tmp_path):
    creator = BusinessPPTCreator(template_base_path=str(tmp_path))

    template_path = creator._get_template_path("Business")

    assert template_path.endswith("Business.pptx")


def test_business_ppt_creator_rejects_invalid_schema(tmp_path):
    creator = BusinessPPTCreator(template_base_path=str(tmp_path))

    with pytest.raises(ValueError, match="Invalid PPT schema"):
        creator.create_presentation({}, str(tmp_path / "out.pptx"))
