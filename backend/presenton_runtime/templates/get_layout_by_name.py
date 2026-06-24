from templates.get_layout_by_name_support.custom_templates import (
    is_custom_layout_name,
    resolve_custom_layout,
)
from templates.get_layout_by_name_support.default_templates import (
    LOGGER,
    fetch_primary_schema_payload,
    fetch_template_fallback_payload,
    preview_detail,
)
from templates.get_layout_by_name_support.icon_resolution import (
    apply_icon_weight_overrides,
)
from templates.get_layout_by_name_support.layout_schema_builders import (
    build_presentation_layout_model,
    raise_layout_not_found,
)


async def get_layout_by_name(layout_name: str):
    if is_custom_layout_name(layout_name):
        return await resolve_custom_layout(layout_name)

    schema_payload, runtime_error = await fetch_primary_schema_payload(layout_name)
    if schema_payload is None:
        schema_payload, fallback_error = await fetch_template_fallback_payload(layout_name)
        if schema_payload and runtime_error:
            LOGGER.info(
                "[template_layout] primary extract-schema failed template=%r detail=%s",
                layout_name,
                preview_detail(runtime_error),
            )
        if schema_payload is None:
            if runtime_error:
                LOGGER.warning(
                    "[template_layout] extract-schema HTTP error template=%r detail=%s",
                    layout_name,
                    preview_detail(runtime_error),
                )
            raise_layout_not_found(
                layout_name,
                runtime_error or fallback_error or "unknown error",
            )

    schema_payload = await apply_icon_weight_overrides(
        layout_name=layout_name,
        schema_payload=schema_payload,
    )
    return build_presentation_layout_model(
        layout_name=layout_name,
        schema_payload=schema_payload,
    )
