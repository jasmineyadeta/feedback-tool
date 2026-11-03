/** D22 limits — single source of truth for client and server. */
export const LIMITS = {
  pdfMaxBytes: 15 * 1024 * 1024,
  pdfMaxPages: 30,
  recordingMaxMs: 10 * 60 * 1000,
  commentsPerSubmission: 60,
  invitesPerReview: 20,
  reviewsPerOwner: 10,
  audioMaxBytes: 25 * 1024 * 1024,
  contextMaxChars: 1000,
  titleMaxChars: 200,
  commentMaxChars: 5000,
  audioRetentionDays: 90,
} as const;

export const AUDIO_MIME_ALLOWLIST = ['audio/mp4', 'audio/webm', 'audio/mpeg', 'audio/wav'] as const;
export type AudioMime = (typeof AUDIO_MIME_ALLOWLIST)[number];

/** Strip codec params: "audio/webm;codecs=opus" -> "audio/webm". */
export function baseMime(m: string): string {
  return m.split(';')[0]!.trim().toLowerCase();
}
export function isAllowedAudioMime(m: string): m is AudioMime {
  return (AUDIO_MIME_ALLOWLIST as readonly string[]).includes(baseMime(m));
}
