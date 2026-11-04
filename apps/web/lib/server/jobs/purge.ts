import 'server-only';
import { adminClient } from '../supabase';

/** D-retention: audio is kept 90 days for the owner to listen to, then deleted. Transcripts stay. */
export async function purgeExpiredAudio(now = new Date(), limit = 200) {
  const admin = adminClient();
  const { data, error } = await admin
    .from('recordings')
    .select('id,audio_file_key')
    .not('audio_file_key', 'is', null)
    .lte('delete_audio_after', now.toISOString())
    .limit(limit);
  if (error) throw error;
  let purged = 0;
  for (const r of data ?? []) {
    const rm = await admin.storage.from('audio').remove([r.audio_file_key as string]);
    if (rm.error) {
      await admin.from('storage_deletions').insert({ bucket: 'audio', path: r.audio_file_key });
    }
    await admin.from('recordings').update({ audio_file_key: null }).eq('id', r.id);
    purged++;
  }
  return purged;
}
