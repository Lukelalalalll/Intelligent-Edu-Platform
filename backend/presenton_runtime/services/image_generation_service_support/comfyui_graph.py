import secrets

COMFYUI_MAX_SEED = 0xFFFFFFFFFFFFFFFF
COMFYUI_SEED_SOURCE_VALUE_KEYS = {"value", "int", "integer", "number"}


def inject_prompt_into_workflow(workflow: dict, prompt: str) -> dict:
    node_index = build_comfyui_node_index(workflow)

    def norm(value) -> str:
        return str(value or "").strip().lower()

    preferred_keys = (
        "text",
        "value",
        "prompt",
        "string",
        "content",
        "instruction",
        "input",
        "query",
    )
    ignore_keys = {
        "filename_prefix",
        "ckpt_name",
        "clip_name",
        "vae_name",
        "unet_name",
        "sampler_name",
        "scheduler",
        "type",
        "device",
        "model",
        "lora_name",
    }
    visited = set()

    def try_set(node_id: str) -> bool:
        node_key = str(node_id)
        if node_key in visited:
            return False
        visited.add(node_key)

        node = node_index.get(node_key)
        if not isinstance(node, dict):
            return False

        inputs = node.setdefault("inputs", {})
        for key in preferred_keys:
            if key in inputs and isinstance(inputs[key], str):
                inputs[key] = prompt
                return True

        string_candidates = [
            key for key, value in inputs.items() if isinstance(value, str) and key not in ignore_keys
        ]
        if len(string_candidates) == 1:
            inputs[string_candidates[0]] = prompt
            return True

        for value in inputs.values():
            if is_comfyui_link(value):
                if try_set(value[0]):
                    return True
            elif isinstance(value, list):
                for item in value:
                    if is_comfyui_link(item) and try_set(item[0]):
                        return True
        return False

    input_prompt_nodes = [
        node_id
        for node_id, node_data in node_index.items()
        if norm(node_data.get("_meta", {}).get("title")) == "input prompt"
    ]
    if not input_prompt_nodes:
        raise ValueError(
            "Could not find node with title 'Input Prompt'. Rename your prompt node to 'Input Prompt'."
        )

    for node_id in input_prompt_nodes:
        if try_set(node_id):
            return workflow
    raise ValueError(
        "Found 'Input Prompt', but no writable prompt string field was found directly or through linked nodes."
    )


def inject_random_seeds_into_workflow(workflow: dict) -> int:
    node_index = build_comfyui_node_index(workflow)
    randomized_inputs: set[tuple[int, str]] = set()
    visited_objects: set[int] = set()
    seed_update_count = 0

    def randomize_input(inputs: dict, key: object) -> bool:
        nonlocal seed_update_count
        key_text = str(key)
        marker = (id(inputs), key_text)
        if marker in randomized_inputs:
            return False

        value = inputs.get(key)
        if not is_comfyui_seed_value(value):
            return False

        new_seed = generate_comfyui_seed()
        inputs[key] = str(new_seed) if isinstance(value, str) else new_seed
        randomized_inputs.add(marker)
        seed_update_count += 1
        return True

    def randomize_linked_seed_source(link: list | tuple) -> None:
        source_node = node_index.get(str(link[0]))
        if not isinstance(source_node, dict):
            return
        inputs = source_node.get("inputs")
        if not isinstance(inputs, dict):
            return

        updated = False
        for source_key in list(inputs.keys()):
            if is_comfyui_seed_key(source_key):
                updated = randomize_input(inputs, source_key) or updated
        if updated:
            return

        source_candidates = [
            key
            for key, value in inputs.items()
            if normalize_comfyui_key(key) in COMFYUI_SEED_SOURCE_VALUE_KEYS
            and is_comfyui_seed_value(value)
        ]
        if len(source_candidates) == 1:
            randomize_input(inputs, source_candidates[0])

    def walk(obj) -> None:
        object_id = id(obj)
        if object_id in visited_objects:
            return
        visited_objects.add(object_id)

        if isinstance(obj, dict):
            inputs = obj.get("inputs")
            if isinstance(inputs, dict):
                for input_key, input_value in list(inputs.items()):
                    if not is_comfyui_seed_key(input_key):
                        continue
                    if is_comfyui_link(input_value):
                        randomize_linked_seed_source(input_value)
                    else:
                        randomize_input(inputs, input_key)
            for value in obj.values():
                walk(value)
        elif isinstance(obj, list):
            for value in obj:
                walk(value)

    walk(workflow)
    return seed_update_count


def build_comfyui_node_index(workflow: dict) -> dict[str, dict]:
    node_index: dict[str, dict] = {}
    visited_objects: set[int] = set()

    def walk(obj) -> None:
        object_id = id(obj)
        if object_id in visited_objects:
            return
        visited_objects.add(object_id)

        if isinstance(obj, dict):
            if isinstance(obj.get("inputs"), dict):
                node_id = obj.get("id")
                if node_id is not None:
                    node_index[str(node_id)] = obj
            for key, value in obj.items():
                if isinstance(value, dict) and isinstance(value.get("inputs"), dict):
                    node_index[str(key)] = value
                walk(value)
        elif isinstance(obj, list):
            for value in obj:
                walk(value)

    walk(workflow)
    return node_index


def normalize_comfyui_key(key: object) -> str:
    return str(key or "").strip().replace("-", "_").replace(" ", "_").lower()


def is_comfyui_seed_key(key: object) -> bool:
    normalized_key = normalize_comfyui_key(key).replace("_", "")
    return normalized_key == "seed" or normalized_key.endswith("seed")


def is_comfyui_seed_value(value: object) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, str):
        raw_value = value.strip()
        return raw_value.isdigit() or (
            raw_value.startswith("-") and raw_value[1:].isdigit()
        )
    return False


def is_comfyui_link(value: object) -> bool:
    return (
        isinstance(value, (list, tuple))
        and len(value) >= 2
        and isinstance(value[0], (str, int))
        and isinstance(value[1], int)
    )


def generate_comfyui_seed() -> int:
    return secrets.randbelow(COMFYUI_MAX_SEED + 1)


__all__ = [
    "inject_prompt_into_workflow",
    "inject_random_seeds_into_workflow",
]
