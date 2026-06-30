FROM nvidia/cuda:12.9.1-cudnn-runtime-ubuntu24.04

WORKDIR /srv/unlimited-ocr

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV HF_HOME=/srv/unlimited-ocr/.cache/huggingface
ENV UNLIMITED_OCR_PORT=10000
ENV UNLIMITED_OCR_MODEL=Unlimited-OCR
ENV UNLIMITED_OCR_SERVER_MODEL=baidu/Unlimited-OCR

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    python3 \
    python3-pip \
    python3-venv \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && ln -sf /usr/bin/pip3 /usr/local/bin/pip \
    && rm -rf /var/lib/apt/lists/*

COPY wheel/ /tmp/wheel/
COPY requirements.sglang.txt /tmp/requirements.sglang.txt
COPY start-unlimited-ocr.sh /usr/local/bin/start-unlimited-ocr

RUN sed -i 's/\r$//' /usr/local/bin/start-unlimited-ocr \
    && chmod +x /usr/local/bin/start-unlimited-ocr \
    && python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install --index-url https://download.pytorch.org/whl/cu129 \
        torch==2.10.0 torchvision==0.25.0 \
    && python -m pip install /tmp/wheel/sglang-0.0.0.dev11416+g92e8bb79e-py3-none-any.whl \
    && python -m pip install -r /tmp/requirements.sglang.txt \
    && rm -rf /tmp/wheel /root/.cache/pip

RUN useradd --system --create-home --shell /usr/sbin/nologin app \
    && mkdir -p /srv/unlimited-ocr/.cache/huggingface \
    && chown -R app:app /srv/unlimited-ocr

USER app

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=90s \
  CMD curl -fsS http://127.0.0.1:10000/health || exit 1

CMD ["start-unlimited-ocr"]
