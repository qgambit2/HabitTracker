#!/usr/bin/env node
/**
 * Generates a short, pleasant success chime as a 16-bit PCM WAV file with no
 * external dependencies (pure Node — no ffmpeg). Run once:
 *
 *   node scripts/generate-chime.js
 *
 * Output: assets/sounds/chime.wav
 *
 * The chime is a two-note arpeggio (a major third up to the fifth) with a few
 * harmonics and an exponential decay, which reads as a bright "ding" reward.
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const DURATION = 0.6; // seconds
const numSamples = Math.floor(SAMPLE_RATE * DURATION);

// Two staggered notes: C6 then G6 (a rising, celebratory interval).
const notes = [
  { freq: 1046.5, start: 0.0 }, // C6
  { freq: 1568.0, start: 0.12 }, // G6
];
// Relative amplitude of each harmonic gives the tone a bell-like timbre.
const harmonics = [1, 0.5, 0.25, 0.12];

const samples = new Float32Array(numSamples);
for (let i = 0; i < numSamples; i++) {
  const t = i / SAMPLE_RATE;
  let value = 0;
  for (const note of notes) {
    const local = t - note.start;
    if (local < 0) continue;
    const envelope = Math.exp(-local * 6); // exponential decay
    for (let h = 0; h < harmonics.length; h++) {
      value += harmonics[h] * Math.sin(2 * Math.PI * note.freq * (h + 1) * local);
    }
    value *= envelope;
  }
  samples[i] = value;
}

// Normalize to avoid clipping, then leave a little headroom.
let peak = 0;
for (let i = 0; i < numSamples; i++) peak = Math.max(peak, Math.abs(samples[i]));
const gain = peak > 0 ? 0.9 / peak : 1;

// Build the WAV (RIFF) byte buffer: 44-byte header + 16-bit PCM data.
const bytesPerSample = 2;
const dataSize = numSamples * bytesPerSample;
const buffer = Buffer.alloc(44 + dataSize);

buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // fmt chunk size
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28); // byte rate
buffer.writeUInt16LE(bytesPerSample, 32); // block align
buffer.writeUInt16LE(16, 34); // bits per sample
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

for (let i = 0; i < numSamples; i++) {
  const clamped = Math.max(-1, Math.min(1, samples[i] * gain));
  buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesPerSample);
}

const outDir = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'chime.wav');
fs.writeFileSync(outPath, buffer);
console.log(`Wrote ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
