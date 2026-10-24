// Original music bed for the demo: warm pads, a plucked arp, soft four-on-the-floor,
// side-chained to breathe. 96 BPM, D minor-ish (i–VI–III–VII). Renders a 16-bit stereo WAV.
import fs from 'node:fs';

const SR = 44100;
const BPM = 96;
const BEAT = 60 / BPM;          // 0.625s
const BAR = BEAT * 4;           // 2.5s
const BARS = 26;                // 65s
const LEN = Math.ceil(BAR * BARS * SR) + SR; // + 1s tail
const L = new Float32Array(LEN);
const R = new Float32Array(LEN);

const midi = (n) => 440 * 2 ** ((n - 69) / 12);
// chord tones (midi): Dm9, Bbmaj7, F(add9), C(add9)  — one bar each, cycling
const CHORDS = [
  [50, 57, 60, 64, 65],   // D F A C E   (Dm9)
  [46, 53, 57, 60, 62],   // Bb F A D    (Bbmaj7 add9)
  [53, 57, 60, 64, 65],   // F A C E     (F add9/maj7)
  [48, 55, 59, 62, 64],   // C G B D E   (C add9 maj7)
];
const BASS = [38, 34, 41, 36]; // D2 Bb1 F2 C2

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function envAD(t, a, d) { if (t < 0) return 0; if (t < a) return t / a; return Math.exp(-(t - a) / d); }

// --- side-chain curve: dip at each beat, recover over the beat ---
function duck(t, amount) {
  const p = (t % BEAT) / BEAT;
  return 1 - amount * Math.exp(-p * 7);
}

// section structure
const barOf = (t) => Math.floor(t / BAR);
const kickOn = (b) => b >= 2 && b <= 20;                      // kick drops for the agent scene + close (bars 21–25)
const hatOn = (b) => b >= 6 && b <= 22;
const arpDensity = (b) => (b < 2 ? 0.35 : b < 8 ? 0.6 : b >= 21 ? 0.5 : 1);

// --- pads ---
function renderPads() {
  for (let bar = 0; bar < BARS; bar++) {
    const chord = CHORDS[bar % 4];
    const start = bar * BAR, end = start + BAR + 0.9; // overlap for legato
    const s0 = Math.floor(start * SR), s1 = Math.min(LEN, Math.floor(end * SR));
    for (const n of chord.slice(1)) { // skip root (bass has it)
      const f = midi(n);
      const det = [0.9975, 1, 1.0025];
      for (let i = s0; i < s1; i++) {
        const t = i / SR, tl = t - start;
        const a = 0.9, rel = tl > BAR ? Math.exp(-(tl - BAR) / 0.45) : 1;
        const env = clamp(tl / a, 0, 1) * rel;
        let v = 0;
        for (let k = 0; k < 3; k++) {
          const ph = t * f * det[k];
          // soft saw via first 5 harmonics, lowpassed by 1/n^1.4
          v += Math.sin(2 * Math.PI * ph) + Math.sin(4 * Math.PI * ph) / 2.6 + Math.sin(6 * Math.PI * ph) / 4.6 + Math.sin(8 * Math.PI * ph) / 7;
        }
        v *= env * 0.030 * duck(t, barOf(t) >= 2 ? 0.35 : 0.1);
        const pan = ((n % 12) / 12) * 0.6 - 0.3;
        L[i] += v * (1 - pan); R[i] += v * (1 + pan);
      }
    }
  }
}

// --- bass ---
function renderBass() {
  for (let bar = 0; bar < BARS; bar++) {
    if (bar < 2 || bar > 22) continue;
    const f = midi(BASS[bar % 4]);
    const start = bar * BAR, s0 = Math.floor(start * SR), s1 = Math.min(LEN, Math.floor((start + BAR) * SR));
    for (let i = s0; i < s1; i++) {
      const t = i / SR, tl = t - start;
      const env = clamp(tl / 0.02, 0, 1) * (tl > BAR - 0.08 ? (BAR - tl) / 0.08 : 1);
      const v = (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * env * 0.16 * duck(t, 0.5);
      L[i] += v; R[i] += v;
    }
  }
}

// --- arp: 16ths, pattern over chord tones one octave up, with a dotted-8th ping-pong delay ---
function renderArp() {
  const dry = new Float32Array(LEN);
  const pattern = [0, 2, 1, 3, 2, 4, 3, 1, 0, 3, 2, 4, 1, 3, 2, 0];
  for (let bar = 0; bar < BARS - 1; bar++) {
    const chord = CHORDS[bar % 4];
    const dens = arpDensity(bar);
    for (let s = 0; s < 16; s++) {
      // thin out the pattern in quieter sections, deterministically
      if (dens < 1 && ((s * 7 + bar * 3) % 10) / 10 > dens) continue;
      const n = chord[pattern[s] % chord.length] + 12;
      const f = midi(n);
      const start = bar * BAR + s * (BEAT / 4);
      const s0 = Math.floor(start * SR), s1 = Math.min(LEN, s0 + Math.floor(0.42 * SR));
      const vel = (s % 4 === 0 ? 1 : 0.72) * (bar < 2 ? 0.6 : 1);
      for (let i = s0; i < s1; i++) {
        const tl = (i - s0) / SR;
        const env = envAD(tl, 0.004, 0.11);
        const ph = 2 * Math.PI * f * tl;
        const v = (Math.sin(ph) * 0.7 + Math.sin(2 * ph) * 0.25 * Math.exp(-tl / 0.05) + (2 / Math.PI) * Math.asin(Math.sin(ph)) * 0.2) * env * 0.09 * vel;
        dry[i] += v;
      }
    }
  }
  // ping-pong delay
  const dl = Math.floor(BEAT * 0.75 * SR);
  const fbL = new Float32Array(LEN), fbR = new Float32Array(LEN);
  for (let i = 0; i < LEN; i++) {
    const inL = dry[i] * 0.55, inR = 0;
    const dLeft = i - dl >= 0 ? fbR[i - dl] : 0;
    const dRight = i - dl >= 0 ? fbL[i - dl] : 0;
    fbL[i] = inL + dLeft * 0.42;
    fbR[i] = inR + dRight * 0.42 + (i - dl >= 0 ? dry[i - dl] * 0.35 : 0);
  }
  for (let i = 0; i < LEN; i++) {
    const t = i / SR;
    const d = duck(t, barOf(t) >= 2 ? 0.25 : 0);
    L[i] += (dry[i] * 0.8 + fbL[i] * 0.5) * d;
    R[i] += (dry[i] * 0.8 + fbR[i] * 0.5) * d;
  }
}

// --- drums ---
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 - 0.5; };
function renderDrums() {
  for (let bar = 0; bar < BARS; bar++) {
    for (let beat = 0; beat < 4; beat++) {
      const start = bar * BAR + beat * BEAT;
      if (kickOn(bar)) {
        const vel = beat % 2 === 0 ? 1 : 0.8;
        const s0 = Math.floor(start * SR), s1 = Math.min(LEN, s0 + Math.floor(0.32 * SR));
        let ph = 0;
        for (let i = s0; i < s1; i++) {
          const tl = (i - s0) / SR;
          const f = 42 + 110 * Math.exp(-tl / 0.045);
          ph += (2 * Math.PI * f) / SR;
          const v = Math.sin(ph) * Math.exp(-tl / 0.14) * 0.42 * vel + rnd() * Math.exp(-tl / 0.012) * 0.25;
          L[i] += v; R[i] += v;
        }
      }
      if (hatOn(bar)) {
        // closed hat on the off-beat, a ghost on the 16th before the beat
        for (const [off, vel] of [[0.5, 0.12], [0.75, 0.05]]) {
          const s0 = Math.floor((start + off * BEAT) * SR), s1 = Math.min(LEN, s0 + Math.floor(0.07 * SR));
          let prev = 0;
          for (let i = s0; i < s1; i++) {
            const tl = (i - s0) / SR;
            const n = rnd();
            const hp = n - prev; prev = n; // crude highpass
            const v = hp * Math.exp(-tl / 0.025) * vel;
            L[i] += v * 0.9; R[i] += v * 1.1;
          }
        }
      }
    }
  }
  // risers into bar 9 and the close
  for (const atBar of [8, 24]) {
    const end = atBar * BAR, start = end - BAR * 1.5;
    const s0 = Math.floor(start * SR), s1 = Math.min(LEN, Math.floor(end * SR));
    let prev = 0;
    for (let i = s0; i < s1; i++) {
      const p = (i - s0) / (s1 - s0);
      const n = rnd();
      const hp = n - prev * (1 - p * 0.9); prev = n;
      const v = hp * p * p * 0.07;
      L[i] += v; R[i] += v;
    }
  }
}

renderPads();
renderBass();
renderArp();
renderDrums();

// master: fades, soft clip, normalize
const fadeIn = 0.8 * SR, fadeOutStart = (BAR * BARS - 3.2) * SR, total = BAR * BARS * SR;
let peak = 0;
for (let i = 0; i < LEN; i++) {
  let g = 1;
  if (i < fadeIn) g = i / fadeIn;
  if (i > fadeOutStart) g = clamp((total - i) / (total - fadeOutStart), 0, 1);
  L[i] = Math.tanh(L[i] * 1.6) * g; R[i] = Math.tanh(R[i] * 1.6) * g;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak;
const out = Buffer.alloc(44 + LEN * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + LEN * 4, 4); out.write('WAVE', 8);
out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(LEN * 4, 40);
for (let i = 0; i < LEN; i++) {
  out.writeInt16LE(Math.round(clamp(L[i] * norm, -1, 1) * 32767), 44 + i * 4);
  out.writeInt16LE(Math.round(clamp(R[i] * norm, -1, 1) * 32767), 46 + i * 4);
}
const path = new URL('./music.wav', import.meta.url).pathname;
fs.writeFileSync(path, out);
console.log('wrote', path, (LEN / SR).toFixed(1) + 's');
