#!/usr/bin/env bash
set -euo pipefail

exec python -m sglang.launch_server \
  --model "${UNLIMITED_OCR_SERVER_MODEL:-baidu/Unlimited-OCR}" \
  --served-model-name "${UNLIMITED_OCR_MODEL:-Unlimited-OCR}" \
  --attention-backend "${UNLIMITED_OCR_ATTENTION_BACKEND:-fa3}" \
  --page-size "${UNLIMITED_OCR_PAGE_SIZE:-1}" \
  --mem-fraction-static "${UNLIMITED_OCR_MEM_FRACTION_STATIC:-0.8}" \
  --context-length "${UNLIMITED_OCR_CONTEXT_LENGTH:-32768}" \
  --enable-custom-logit-processor \
  --disable-overlap-schedule \
  --skip-server-warmup \
  --host 0.0.0.0 \
  --port "${UNLIMITED_OCR_PORT:-10000}"
