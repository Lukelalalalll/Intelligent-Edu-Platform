"""Avatar overlay via wav2lip (Phase 3.1).

Strategy
--------
- ``avatar_mode="none"`` → skip entirely (default, no dependencies required)
- ``avatar_mode="wav2lip"`` → CPU-compatible; requires wav2lip installed and
  a ``WAV2LIP_DIR`` environment variable pointing to the checkout directory.
- ``avatar_mode="latentsync"`` → GPU mode; ``LATENTSYNC_SCRIPT`` env var must
  point to the inference script.

All public functions return ``False`` (or the original path) gracefully when the
requested tool is unavailable — the pipeline never raises due to a missing avatar
dependency.
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Environment configuration ────────────────────────────────────────────────
_WAV2LIP_DIR = os.environ.get("WAV2LIP_DIR", "")          # e.g. /opt/Wav2Lip
_LATENTSYNC_SCRIPT = os.environ.get("LATENTSYNC_SCRIPT", "")  # e.g. /opt/latentsync/inference.py

_AVATAR_TIMEOUT = int(os.environ.get("AVATAR_TIMEOUT", "600"))  # seconds per clip


@lru_cache(maxsize=1)
def is_wav2lip_available() -> bool:
    """Return True if wav2lip inference.py is usable."""
    if not _WAV2LIP_DIR:
        return False
    script = Path(_WAV2LIP_DIR) / "inference.py"
    if not script.is_file():
        logger.debug("wav2lip inference.py not found at %s", script)
        return False
    # Check that python3 is available
    return shutil.which("python3") is not None


@lru_cache(maxsize=1)
def is_latentsync_available() -> bool:
    """Return True if the latentsync inference script is usable."""
    if not _LATENTSYNC_SCRIPT:
        return False
    script = Path(_LATENTSYNC_SCRIPT)
    if not script.is_file():
        logger.debug("latentsync script not found at %s", script)
        return False
    return shutil.which("python3") is not None


def apply_avatar(
    video_path: Path,
    avatar_img_path: Path,
    out_path: Path,
    mode: str = "wav2lip",
) -> bool:
    """Overlay a talking-head avatar on *video_path* using wav2lip or latentsync.

    Parameters
    ----------
    video_path:
        Input MP4 (already has audio track).
    avatar_img_path:
        Reference face image (PNG/JPG) or short video for the avatar.
    out_path:
        Destination MP4 path.
    mode:
        ``"wav2lip"`` | ``"latentsync"``.  Anything else returns False.

    Returns
    -------
    bool
        True on success, False on any failure / unavailable tool.
    """
    if mode == "none":
        return False

    if mode == "wav2lip":
        return _apply_wav2lip(video_path, avatar_img_path, out_path)
    elif mode == "latentsync":
        return _apply_latentsync(video_path, avatar_img_path, out_path)
    else:
        logger.warning("Unknown avatar_mode=%r — skipping avatar", mode)
        return False


def _apply_wav2lip(
    video_path: Path,
    face_path: Path,
    out_path: Path,
) -> bool:
    """Run wav2lip inference.py via subprocess."""
    if not is_wav2lip_available():
        logger.info("wav2lip not available — skipping avatar overlay")
        return False

    if not face_path.is_file():
        logger.warning("Avatar face image not found: %s — skipping", face_path)
        return False

    inference_py = str(Path(_WAV2LIP_DIR) / "inference.py")
    cmd = [
        "python3", inference_py,
        "--checkpoint_path", str(Path(_WAV2LIP_DIR) / "checkpoints" / "wav2lip_gan.pth"),
        "--face", str(face_path),
        "--audio", str(video_path),   # wav2lip accepts video as audio source
        "--outfile", str(out_path),
        "--resize_factor", "1",
    ]
    logger.info("Running wav2lip: %s", " ".join(cmd[:5]) + " ...")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_AVATAR_TIMEOUT,
            cwd=_WAV2LIP_DIR,
        )
        if result.returncode != 0:
            logger.error("wav2lip failed (rc=%d): %s", result.returncode, result.stderr[-500:])
            return False
        if not out_path.is_file():
            logger.error("wav2lip produced no output at %s", out_path)
            return False
        logger.info("wav2lip avatar applied: %s", out_path)
        return True
    except subprocess.TimeoutExpired:
        logger.error("wav2lip timed out after %ds", _AVATAR_TIMEOUT)
        return False
    except Exception as exc:
        logger.error("wav2lip error: %s", exc)
        return False


def _apply_latentsync(
    video_path: Path,
    face_path: Path,
    out_path: Path,
) -> bool:
    """Run latentsync inference via subprocess."""
    if not is_latentsync_available():
        logger.info("latentsync not available — skipping avatar overlay")
        return False

    if not face_path.is_file():
        logger.warning("Avatar face image not found: %s — skipping", face_path)
        return False

    cmd = [
        "python3", _LATENTSYNC_SCRIPT,
        "--video_path", str(video_path),
        "--face_image", str(face_path),
        "--output_path", str(out_path),
    ]
    logger.info("Running latentsync: %s", " ".join(cmd[:5]) + " ...")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_AVATAR_TIMEOUT,
        )
        if result.returncode != 0:
            logger.error("latentsync failed (rc=%d): %s", result.returncode, result.stderr[-500:])
            return False
        if not out_path.is_file():
            logger.error("latentsync produced no output at %s", out_path)
            return False
        logger.info("latentsync avatar applied: %s", out_path)
        return True
    except subprocess.TimeoutExpired:
        logger.error("latentsync timed out after %ds", _AVATAR_TIMEOUT)
        return False
    except Exception as exc:
        logger.error("latentsync error: %s", exc)
        return False
