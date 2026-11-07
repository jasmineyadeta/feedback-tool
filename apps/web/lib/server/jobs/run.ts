import { processDue } from '../recordings';
import { purgeExpiredAudio } from './purge';
import { classifyPending } from '../tone';

/** `pnpm jobs:run` — hourly from `pnpm dev`: retry due transcriptions, label tones, purge expired audio. */
async function main() {
  const processed = await processDue(25);
  const toned = await classifyPending().catch(() => 0);
  const purged = await purgeExpiredAudio();
  console.info(`jobs: processed=${processed.length} toned=${toned} purged=${purged}`);
}
main().catch((e) => {
  console.error('jobs failed', e instanceof Error ? e.message : 'unknown');
  process.exit(1);
});
