#!/usr/bin/env bash
# M3 spike: build test recordings with speech at KNOWN times, so we can check whisper's word timestamps.
# Usage: scripts/spike-make-audio.sh <output-dir>
# Writes: phrase WAVs, mix.wav, iphone.m4a (AAC, like Safari's audio/mp4), chrome.webm (Opus), truth.json
set -euo pipefail
out="$1"
mkdir -p "$out"

phrases=(
  "The summary at the top is strong"
  "This project section needs dates"
  "I would move education to the end"
  "The contact line looks great"
)
offsets=(0.5 4.0 8.0 12.5) # seconds where each phrase is placed

inputs=()
filter=""
truth="["
for i in 0 1 2 3; do
  say -v Samantha -o "$out/p$i.aiff" "${phrases[$i]}"
  ffmpeg -loglevel error -y -i "$out/p$i.aiff" -ar 48000 -ac 1 "$out/p$i.wav"
  # Leading silence inside the synthesized phrase, so "truth" is when speech actually starts.
  # Only a silence that starts at 0 counts as leading silence (not pauses between words).
  det=$(ffmpeg -i "$out/p$i.wav" -af silencedetect=n=-40dB:d=0.02 -f null - 2>&1 | grep -E 'silence_(start|end)' || true)
  lead=0
  if echo "$det" | head -1 | grep -qE 'silence_start: (0|-?0\.0+[0-9]*)$'; then
    lead=$(echo "$det" | grep -m1 'silence_end' | sed -E 's/.*silence_end: ([0-9.]+).*/\1/')
  fi
  start=$(printf '%.3f' "$(echo "${offsets[$i]} + $lead" | bc -l)")
  ms=$(echo "${offsets[$i]} * 1000 / 1" | bc)
  inputs+=(-i "$out/p$i.wav")
  filter+="[$i]adelay=${ms}:all=1[a$i];"
  [ "$i" -gt 0 ] && truth+=","
  truth+="{\"text\":\"${phrases[$i]}\",\"startSec\":$start}"
done
truth+="]"
echo "$truth" >"$out/truth.json"

ffmpeg -loglevel error -y "${inputs[@]}" \
  -filter_complex "${filter}[a0][a1][a2][a3]amix=inputs=4:normalize=0,apad=pad_dur=1" \
  -ar 48000 -ac 1 "$out/mix.wav"
ffmpeg -loglevel error -y -i "$out/mix.wav" -c:a aac -b:a 64k -movflags +faststart "$out/iphone.m4a"
ffmpeg -loglevel error -y -i "$out/mix.wav" -c:a libopus -b:a 48k "$out/chrome.webm"
echo "wrote $out/iphone.m4a, $out/chrome.webm, $out/truth.json"
