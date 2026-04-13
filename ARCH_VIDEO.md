# Video Generation Pipeline — Detailed Architecture

---

## Overview

The video generation system converts a **lecture topic** into a fully rendered MP4 lecture video using a multi-stage pipeline: AI script generation → TTS audio synthesis → HTML/CSS slide rendering → FFmpeg compositing. All progress is streamed to the browser via SSE.

---

## 1. End-to-End Pipeline Overview

```
  User clicks "Generate Video" → POST /api/video/generate
          │
          │  { topic, courseId?, style?, duration?, voice?, locale? }
          ▼
  ┌───────────────────────────────────────────────────────────────────┐
  │  video_routes.py                                                  │
  │  Creates a generation job, responds with { jobId }                │
  │                                                                   │
  │  Background task: asyncio.create_task(run_pipeline(jobId, ...))   │
  └──────────────────────────┬────────────────────────────────────────┘
                             │
                             │  Browser opens SSE stream:
                             │  GET /api/video/status/{jobId}
                             │
          ┌──────────────────┴─────────────────────────────────────┐
          │                                                         │
          │  EventSource reads progress events in real-time         │
          └─────────────────────────────────────────────────────────┘
                             │
  PIPELINE STAGES:           ▼
  ────────────────────────────────────────────────────────────────────
  [10%] generate_script()    ← AI writes structured JSON script
  [25%] scripts_to_audio()   ← edge-TTS converts narration → MP3
  [50%] render_slides()      ← Playwright renders HTML → PNG frames
  [65%] make_clips()         ← FFmpeg: image + audio → per-scene MP4
  [88%] concat_video()       ← FFmpeg: join all scenes → final MP4
  [100%] done               ← { videoUrl } returned to browser
  ────────────────────────────────────────────────────────────────────
```

---

## 2. Stage 1 — Script Generation

```
  services/video_service/script.py

  ┌──────────────────────────────────────────────────────────────────────┐
  │  Input:  topic, durationMinutes (default: 3), style, locale          │
  │                                                                      │
  │  System prompt built from:                                           │
  │  - prompts/video_script.yaml                                         │
  │  - locale → "Chinese" or "English"                                   │
  │  - style  → "academic" / "casual" / "engaging"                       │
  │                                                                      │
  │  LLM is asked to output STRICT JSON:                                 │
  └──────────────────────────────────────────────────────────────────────┘

  JSON Script Format:
  ┌──────────────────────────────────────────────────────────────────────┐
  │  {                                                                   │
  │    "title": "Introduction to Machine Learning",                      │
  │    "scenes": [                                                       │
  │      {                                                               │
  │        "sceneIndex": 0,                                              │
  │        "slideTitle": "What is ML?",                                  │
  │        "bullets": ["Def 1", "Def 2", "Def 3"],                       │
  │        "narration": "Today we explore machine learning...",          │
  │        "tone": "intro" | "concept" | "example" |                    │
  │                "summary" | "question"                                │
  │      },                                                              │
  │      ...  (N scenes, each ~30-45 seconds of narration)              │
  │    ]                                                                 │
  │  }                                                                   │
  └──────────────────────────────────────────────────────────────────────┘

  Fallback:  If LLM response is not valid JSON → retry once with
             explicit "respond only with JSON" instruction.
             If still invalid → parse partial JSON with regex.

  AI Backend:  AIGatewayService (Coze API preferred, Ollama fallback)
```

---

## 3. Stage 2 — Audio Synthesis (TTS)

```
  services/video_service/tts.py

  ┌────────────────────────────────────────────────────────────────────┐
  │  Input: list of { sceneIndex, narration, tone } dicts              │
  │                                                                    │
  │  Library: edge-tts  (Microsoft Edge TTS, free, no API key)         │
  └────────────────────────────────────────────────────────────────────┘

  For each scene:    (processed CONCURRENTLY with asyncio.gather)
  ┌────────────────────────────────────────────────────────────────────┐
  │  tone → SSML prosody settings:                                     │
  │                                                                    │
  │  "intro"     →  rate="-5%",  pitch="+2Hz"  (steady, welcoming)    │
  │  "concept"   →  rate="-10%", pitch="0Hz"   (slow, clear)          │
  │  "example"   →  rate="+0%",  pitch="+1Hz"  (natural)              │
  │  "summary"   →  rate="-8%",  pitch="-1Hz"  (deliberate)           │
  │  "question"  →  rate="+5%",  pitch="+3Hz"  (curious, rising)      │
  │                                                                    │
  │  Voice selected by locale:                                         │
  │  zh-CN → "zh-CN-XiaoxiaoNeural" (default) or user override        │
  │  en-US → "en-US-JennyNeural" (default) or user override           │
  │                                                                    │
  │  SSML template:                                                    │
  │  <speak>                                                           │
  │    <voice name="{voice}">                                          │
  │      <prosody rate="{rate}" pitch="{pitch}">                       │
  │        {narration text}                                            │
  │      </prosody>                                                    │
  │    </voice>                                                        │
  │  </speak>                                                          │
  │                                                                    │
  │  Output: audio/scene_{i}.mp3  (saved to tmp directory)            │
  └────────────────────────────────────────────────────────────────────┘

  Audio Duration Detection:
  ffprobe -v quiet -print_format json -show_format scene_{i}.mp3
  → duration seconds used to set slide display length in FFmpeg
```

---

## 4. Stage 3 — Slide Rendering

```
  services/video_service/render.py

  Primary path: Playwright headless Chromium
  Fallback path: Pillow (PIL) — pure Python image generation
  ┌──────────────────────────────────────────────────────────────────────┐
  │  For each scene:                                                      │
  │                                                                      │
  │  1. Build HTML string from template:                                 │
  │     - Title bar with slide title                                     │
  │     - Bullet points list                                             │
  │     - Bottom progress bar (sceneIndex / totalScenes)                 │
  │     - CSS theme applied (10 available themes)                        │
  │                                                                      │
  │  2. PLAYWRIGHT PATH (if installed):                                  │
  │     browser = await p.chromium.launch(headless=True)                 │
  │     page.set_content(html)                                           │
  │     await page.set_viewport_size({"width":1280,"height":720})        │
  │     await page.screenshot(path=slide_{i}.png, full_page=False)       │
  │                                                                      │
  │  3. PILLOW FALLBACK (if Playwright unavailable):                     │
  │     img = Image.new("RGB", (1280, 720), bg_color)                    │
  │     draw = ImageDraw.Draw(img)                                       │
  │     draw.text(title_pos, title, font=title_font, fill=text_color)    │
  │     for bullet in bullets:                                           │
  │       draw.text(bullet_pos, f"• {bullet}", ...)                     │
  │     img.save(slide_{i}.png)                                          │
  └──────────────────────────────────────────────────────────────────────┘

  10 Built-in Slide Themes:
  ┌──────────────────┬──────────────┬───────────────────────────────────┐
  │  theme name      │  BG color    │  text color / accent              │
  ├──────────────────┼──────────────┼───────────────────────────────────┤
  │  default         │  #1a1a2e    │  white / #e94560                   │
  │  ocean           │  #0077b6    │  white / #00b4d8                   │
  │  forest          │  #1b4332    │  #d8f3dc / #52b788                 │
  │  sunset          │  #7400b8    │  white / #f72585                   │
  │  minimal         │  #ffffff    │  #333 / #0077b6                    │
  │  dark            │  #0d1117    │  #c9d1d9 / #58a6ff                 │
  │  warm            │  #fff8f0    │  #3d1c00 / #e07800                 │
  │  corporate       │  #003366    │  white / #ffd700                   │
  │  pastel          │  #fce4ec    │  #4a0a2c / #f06292                 │
  │  tech            │  #0a0e1a    │  #00ff88 / #00ccff                 │
  └──────────────────┴──────────────┴───────────────────────────────────┘

  Output: generated/videos/{jobId}/slides/slide_{i}.png
```

---

## 5. Stage 4 — Per-Scene Video Clip

```
  services/video_service/compose.py  →  _make_clip()

  Input per scene:
    - slide_{i}.png     (1280×720 PNG)
    - scene_{i}.mp3     (narration audio)
    - duration_i        (seconds, from ffprobe)

  FFmpeg command:
  ┌──────────────────────────────────────────────────────────────────┐
  │  ffmpeg                                                          │
  │    -loop 1                   ← repeat still image               │
  │    -i slide_{i}.png          ← input image                      │
  │    -i scene_{i}.mp3          ← input audio                      │
  │    -c:v libx264              ← H.264 video codec                 │
  │    -tune stillimage          ← optimized for still frames        │
  │    -c:a aac                  ← AAC audio codec                   │
  │    -b:a 128k                                                     │
  │    -vf "scale=1280:720:force_original_aspect_ratio=decrease,     │
  │          pad=1280:720:(ow-iw)/2:(oh-ih)/2"                       │
  │           ↑ center-pad image to 1280×720 (letterbox)            │
  │    -t {duration_i}           ← clip length = audio length        │
  │    -pix_fmt yuv420p          ← compatibility format              │
  │    -y                        ← overwrite                         │
  │    clip_{i}.mp4                                                  │
  └──────────────────────────────────────────────────────────────────┘

  Note: zoompan effect was removed in V2 for stability.
        Fade transitions removed to reduce render time.

  Output: generated/videos/{jobId}/clips/clip_{i}.mp4
```

---

## 6. Stage 5 — Final Concatenation

```
  services/video_service/compose.py → _concat_video()

  Creates concat list file:
  ┌──────────────────────────────────────────────────────────────────┐
  │  concat_list.txt                                                 │
  │  file 'clip_0.mp4'                                               │
  │  file 'clip_1.mp4'                                               │
  │  file 'clip_2.mp4'                                               │
  │  ...                                                             │
  └──────────────────────────────────────────────────────────────────┘

  FFmpeg concat command:
  ┌──────────────────────────────────────────────────────────────────┐
  │  ffmpeg                                                          │
  │    -f concat                 ← use concat demuxer                │
  │    -safe 0                   ← allow absolute paths              │
  │    -i concat_list.txt        ← list of input files               │
  │    -c copy                   ← stream copy (no re-encode!)        │
  │    -y                        ← overwrite                         │
  │    final_{jobId}.mp4                                             │
  └──────────────────────────────────────────────────────────────────┘

  "-c copy" means: just mux streams, no transcoding → very fast

  Output: generated/videos/{jobId}/final_{jobId}.mp4
  Served at: GET /api/video/file/{jobId}
  → backend/static/videos/  or  backend/generated/videos/
```

---

## 7. SSE Progress Streaming

```
  GET /api/video/status/{jobId}
  Content-Type: text/event-stream

  ┌──────────────────────────────────────────────────────────────────┐
  │  Backend sends SSE events as pipeline progresses:                │
  │                                                                  │
  │  data: {"progress": 10, "message": "Generating script..."}       │
  │                                                                  │
  │  data: {"progress": 25, "message": "Synthesizing audio..."}      │
  │                                                                  │
  │  data: {"progress": 40, "message": "Rendering scene 2/8..."}     │
  │                                                                  │
  │  data: {"progress": 50, "message": "Rendering slides done"}      │
  │                                                                  │
  │  data: {"progress": 65, "message": "Compositing clips..."}       │
  │                                                                  │
  │  data: {"progress": 88, "message": "Merging final video..."}     │
  │                                                                  │
  │  data: {"progress": 100, "videoUrl": "/api/video/file/abc123",  │
  │          "message": "Complete!"}                                  │
  │                                                                  │
  │  (connection closed by server after 100%)                        │
  └──────────────────────────────────────────────────────────────────┘

  Frontend (VideoGenPage.tsx):
    const es = new EventSource(`/api/video/status/${jobId}`)
    es.onmessage = (e) => {
      const { progress, message, videoUrl } = JSON.parse(e.data)
      setProgress(progress)
      setStatus(message)
      if (videoUrl) { setVideoUrl(videoUrl); es.close() }
    }

  Progress bar in UI updates in real-time, video player appears at 100%
```

---

## 8. File Layout on Disk

```
  backend/generated/videos/
  └── {jobId}/
      ├── script.json          ← generated lecture script
      ├── slides/
      │   ├── slide_0.png
      │   ├── slide_1.png
      │   └── ...
      ├── audio/
      │   ├── scene_0.mp3
      │   ├── scene_1.mp3
      │   └── ...
      ├── clips/
      │   ├── clip_0.mp4
      │   ├── clip_1.mp4
      │   └── ...
      ├── concat_list.txt
      └── final_{jobId}.mp4   ← served to user
```

---

## 9. Key Dependencies

| Component    | Library / Tool           | Notes                                 |
|--------------|--------------------------|---------------------------------------|
| TTS          | `edge-tts` (Python)      | Uses Microsoft Edge TTS, free, async  |
| Slide render | `playwright` (Chromium)  | Falls back to Pillow if unavailable   |
| Image manip  | `Pillow` (PIL)           | Fallback renderer                     |
| Video encode | `FFmpeg` subprocess      | Must be installed on server           |
| Audio probe  | `ffprobe` subprocess     | Bundled with FFmpeg                   |
| AI script    | `AIGatewayService`       | Coze API → Ollama fallback            |

---

*Generated: 2026-04-12*
