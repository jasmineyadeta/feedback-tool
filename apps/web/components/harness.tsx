'use client';
import { useEffect, useRef } from 'react';
import { parseOverlayMessage, type OverlayToShell, type ShellToOverlay } from '@ft/shared/protocol';

declare global {
  interface Window {
    __ftMessages?: OverlayToShell[];
    __ftSend?: (m: ShellToOverlay) => void;
  }
}

export function Harness({
  enterUrl,
  proxyOrigin,
}: {
  enterUrl: string;
  proxyOrigin: string;
  appOrigin: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    window.__ftMessages = [];
    window.__ftSend = (m) => frame.current?.contentWindow?.postMessage(m, proxyOrigin);
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== proxyOrigin || e.source !== frame.current?.contentWindow) return;
      const m = parseOverlayMessage(e.data);
      if (m) window.__ftMessages!.push(m);
    };
    window.addEventListener('message', onMsg);
    // If the frame loaded before this listener existed, ask the overlay to re-announce itself.
    frame.current?.contentWindow?.postMessage({ ft: 1, type: 'ping' }, proxyOrigin);
    return () => window.removeEventListener('message', onMsg);
  }, [proxyOrigin]);
  return (
    <iframe
      ref={frame}
      title="Site preview"
      src={enterUrl}
      data-testid="proxy-frame"
      className="fixed inset-0 h-full w-full border-0"
      allow="fullscreen"
    />
  );
}
