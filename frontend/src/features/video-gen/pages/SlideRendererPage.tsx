/**
 * SlideRendererPage — Headless slide renderer for Playwright screenshot capture.
 *
 * URL: /slide-renderer
 * This page is NOT for end users. No auth required (Playwright has no session).
 *
 * Data injection protocol:
 *   1. Playwright: page.goto('/slide-renderer', wait_until='networkidle')
 *   2. For each scene:
 *      a. Playwright: page.evaluate("window.clearRenderReady()")
 *      b. Playwright: page.evaluate("window.setSlideData({scene, idx, renderSubtitles})")
 *      c. Playwright: page.wait_for_selector('body[data-render-ready="true"]', timeout=5000)
 *      d. Playwright: page.screenshot(path=out_path, clip={x:0,y:0,width:1920,height:1080})
 */
import React, { useEffect, useRef, useState } from 'react';
import SlidePreview from '../components/SlidePreview';
import type { Scene } from '../data/themes';

declare global {
  interface Window {
    setSlideData: (data: SlidePayload) => void;
    clearRenderReady: () => void;
  }
}

interface SlidePayload {
  scene: Scene;
  idx: number;
  renderSubtitles: boolean;
}

export default function SlideRendererPage() {
  const [payload, setPayload] = useState<SlidePayload | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    window.setSlideData = (data: SlidePayload) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setPayload(data);
      // Two rAF cycles: first for React commit, second for browser paint
      rafRef.current = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.body.dataset.renderReady = 'true';
        });
      });
    };

    window.clearRenderReady = () => {
      delete document.body.dataset.renderReady;
    };

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        overflow: 'hidden',
        margin: 0,
        padding: 0,
      }}
    >
      {payload ? (
        <SlidePreview
          scene={payload.scene}
          idx={payload.idx}
          subtitles={payload.renderSubtitles}
          isFullScreen={true}
        />
      ) : (
        <div style={{ width: 1920, height: 1080, background: '#0f2744' }} />
      )}
    </div>
  );
}
