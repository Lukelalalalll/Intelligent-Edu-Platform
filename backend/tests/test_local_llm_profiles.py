from backend.services.local_llm_service import LocalLLMService


def test_local_llm_has_light_and_heavy_profiles():
    light = LocalLLMService._build_options("light")
    heavy = LocalLLMService._build_options("heavy")

    assert light["num_ctx"] <= heavy["num_ctx"]
    assert light["num_predict"] <= heavy["num_predict"]
    assert light["temperature"] <= heavy["temperature"]
