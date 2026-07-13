from services.image_generation_service_support.comfyui_provider import (
    ComfyUIImageGenerationMixin,
)
from services.image_generation_service_support.google_providers import (
    GoogleImageGenerationMixin,
)
from services.image_generation_service_support.open_webui_provider import (
    OpenWebUIImageGenerationMixin,
)
from services.image_generation_service_support.openai_providers import (
    OpenAIImageGenerationMixin,
)
from services.image_generation_service_support.orchestration import (
    ImageGenerationOrchestrationMixin,
)
from services.image_generation_service_support.stock_providers import (
    StockImageProviderMixin,
)
from utils.image_provider import is_image_generation_disabled


class ImageGenerationService(
    ImageGenerationOrchestrationMixin,
    OpenAIImageGenerationMixin,
    GoogleImageGenerationMixin,
    StockImageProviderMixin,
    OpenWebUIImageGenerationMixin,
    ComfyUIImageGenerationMixin,
):
    def __init__(self, output_directory: str):
        self.output_directory = output_directory
        self.is_image_generation_disabled = is_image_generation_disabled()
        self.image_gen_func = self.get_image_gen_func()


__all__ = ["ImageGenerationService"]
