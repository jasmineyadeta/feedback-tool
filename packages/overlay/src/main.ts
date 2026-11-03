// Entry point bundled to dist/overlay.js (IIFE) and injected by the proxy. Filled in M1.
import { OVERLAY_VERSION } from './version';
(window as unknown as { __ftOverlay?: string }).__ftOverlay = OVERLAY_VERSION;
