/** Wrap raw 16-bit little-endian mono PCM in a WAV container (Gemini TTS returns raw PCM at 24 kHz). */
export function pcm16ToWav(pcm: Buffer, sampleRate = 24000, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Parse the sample rate from a mime type like "audio/L16;codec=pcm;rate=24000". */
export function sampleRateFromMime(mime: string | undefined, fallback = 24000): number {
  const m = /rate=(\d+)/i.exec(mime ?? "");
  return m ? Number(m[1]) : fallback;
}
