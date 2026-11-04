import { processDue } from '../recordings';
import { purgeExpiredAudio } from './purge';

/** `pnpm jobs:run` — hourly from `pnpm dev`: retry due transcriptions, purge expired audio. */
async function main() {
  const processed = await processDue(25);
  const purged = await purgeExpiredAudio();
  console.info(`jobs: processed=${processed.length} purged=${purged}`);
}
main().catch((e) => {
  console.error('jobs failed', e instanceof Error ? e.message : 'unknown');
  process.exit(1);
});
