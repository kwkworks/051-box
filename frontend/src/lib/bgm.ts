// 박스 BGM: 음원 파일 없이 Web Audio로 직접 연주하는 8비트 음악 (저작권 문제 없음)
// 브라우저 정책상 사용자가 화면을 한 번 누르거나 키를 눌러야 소리가 시작된다.

const KEY = 'box-bgm';
const BPM = 128;
const STEP = 60 / BPM / 4; // 16분음표 길이(초)

export type BgmSettings = { volume: number; muted: boolean };

export function loadBgmSettings(): BgmSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw.volume === 'number' && typeof raw.muted === 'boolean') {
      return { volume: Math.min(1, Math.max(0, raw.volume)), muted: raw.muted };
    }
  } catch {}
  return { volume: 0.4, muted: false };
}

export function saveBgmSettings(s: BgmSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// 4마디(64스텝) 반복. C-G-Am-F 진행의 신나는 운동 음악
const CHORDS = [
  [48, 52, 55], // C
  [43, 47, 50], // G
  [45, 48, 52], // Am
  [41, 45, 48], // F
];
// 0 = 쉼표. 마디당 16스텝
const LEAD = [
  72, 0, 76, 0, 79, 0, 76, 79, 81, 0, 79, 0, 76, 0, 74, 0,
  74, 0, 71, 0, 74, 0, 79, 0, 77, 0, 76, 0, 74, 0, 71, 0,
  72, 0, 76, 0, 81, 0, 79, 76, 77, 0, 76, 0, 72, 0, 69, 0,
  69, 0, 72, 0, 77, 0, 76, 0, 74, 72, 74, 0, 76, 0, 0, 0,
];

export class Bgm {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextTime = 0;
  private settings: BgmSettings;

  constructor(settings: BgmSettings) {
    this.settings = settings;
  }

  // 사용자 입력(클릭/키) 안에서 호출해야 소리가 난다
  start() {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (this.timer) {
      if (this.ctx?.state !== 'running') this.ctx?.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyVolume();
    // 하이햇용 짧은 잡음
    const len = Math.floor(this.ctx.sampleRate * 0.05);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // 모바일(특히 아이폰)은 사용자 동작 안에서 실제로 소리를 한 번 내야 오디오가 열린다: 무음 한 조각 재생
    const unlock = this.ctx.createBufferSource();
    unlock.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    unlock.connect(this.ctx.destination);
    unlock.start(0);
    this.ctx.resume();

    this.nextTime = this.ctx.currentTime + 0.1;
    // 앞으로 0.2초 분량의 음을 미리 예약해서 끊김 없이 재생
    this.timer = setInterval(() => this.schedule(), 50);
  }

  // 실제로 소리가 나고 있는지 (모바일에서 잠금 해제가 됐는지)
  get running() {
    return this.ctx?.state === 'running';
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.ctx?.close();
    this.ctx = null;
  }

  // 화면이 안 보일 때는 오디오를 잠시 멈춘다 (설정은 그대로)
  setHidden(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) this.ctx.suspend();
    else {
      this.ctx.resume();
      this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.05);
    }
  }

  setSettings(s: BgmSettings) {
    this.settings = s;
    this.applyVolume();
  }

  private applyVolume() {
    if (!this.master || !this.ctx) return;
    const v = this.settings.muted ? 0 : this.settings.volume * 0.25;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextTime < ctx.currentTime + 0.2) {
      this.playStep(this.step % 64, this.nextTime);
      this.nextTime += STEP;
      this.step += 1;
    }
  }

  private tone(type: OscillatorType, f: number, t: number, dur: number, vol: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private playStep(i: number, t: number) {
    const ctx = this.ctx!;
    const bar = Math.floor(i / 16);
    const beat = i % 16;
    const chord = CHORDS[bar];

    // 멜로디
    if (LEAD[i]) this.tone('square', freq(LEAD[i]), t, STEP * 1.8, 0.18);
    // 베이스 (8분음표마다, 근음-5도)
    if (beat % 2 === 0) this.tone('triangle', freq(chord[0] - 12 + (beat % 8 === 4 ? 7 : 0)), t, STEP * 1.6, 0.5);
    // 화음 아르페지오 (작게)
    if (beat % 4 === 2) this.tone('square', freq(chord[(beat / 4) % 3 | 0] + 12), t, STEP, 0.05);
    // 킥 (4분음표)
    if (beat % 4 === 0) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(g).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.16);
    }
    // 하이햇 (8분 뒷박)
    if (beat % 4 === 2 && this.noise) {
      const src = ctx.createBufferSource();
      const hp = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = this.noise;
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(hp).connect(g).connect(this.master!);
      src.start(t);
    }
  }
}

// 앱 전체에서 플레이어 하나만 쓴다. 화면(박스 ↔ 게시판)을 옮겨도 음악이 끊기지 않게
// 컴포넌트가 사라져도 멈추지 않고, 로그아웃할 때만 멈춘다.
let shared: Bgm | null = null;

let watching = false;

export function getBgm(): Bgm {
  shared ??= new Bgm(loadBgmSettings());
  // 휴대폰에서 다른 앱으로 가거나 화면을 끄면(탭이 안 보이면) 멈추고, 돌아오면 이어서 재생
  if (!watching && typeof document !== 'undefined') {
    watching = true;
    const sync = () => shared?.setHidden(document.visibilityState !== 'visible');
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', () => shared?.setHidden(true));
    window.addEventListener('pageshow', sync);
  }
  return shared;
}

export function stopBgm() {
  shared?.stop();
  shared = null;
}
