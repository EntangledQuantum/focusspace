"use client";

const TONES: Record<string, { freq: number[]; duration: number }> = {
  "soft-chime": { freq: [523.25, 659.25, 783.99], duration: 0.8 },
  "gentle-bell": { freq: [440, 554.37, 659.25], duration: 1.2 },
  "deep-bowl": { freq: [220, 277.18, 329.63], duration: 2.0 },
};

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export async function playTone(toneName: string, volume = 0.5): Promise<void> {
  const tone = TONES[toneName] ?? TONES["soft-chime"];
  const audioCtx = getCtx();
  if (audioCtx.state === "suspended") await audioCtx.resume();

  const now = audioCtx.currentTime;

  tone.freq.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = "sine";
    osc.frequency.value = freq;

    const delay = i * 0.15;
    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(volume, now + delay + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + tone.duration);

    osc.start(now + delay);
    osc.stop(now + delay + tone.duration + 0.1);
  });
}

export const TONE_OPTIONS = [
  { value: "soft-chime", label: "Soft Chime (Default)" },
  { value: "gentle-bell", label: "Gentle Bell" },
  { value: "deep-bowl", label: "Deep Bowl" },
];
