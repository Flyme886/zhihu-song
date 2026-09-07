"use client";

/*
 * 桌上的声音。全部现场合成 —— 仓库里没有一个音频文件。
 *
 * ── 为什么不用 mp3 ──
 * 路演是在自己的 Mac 上投影，网络不保证有。十几个采样就是十几个请求，
 * 任何一个没回来那一下就是哑的，而「点结算」那一下不能哑。
 * 合成的代价是这几百行，换来零请求、零体积、零版权。
 * 附带的好处更重要：三态各有自己的音色，反噬那一下能压住整屏 ——
 * 同一份采样调音量做不出这个差别。
 *
 * ── 为什么引擎是懒建的 ──
 * 浏览器不许在用户手势之前开 AudioContext。所以第一次真实交互才建，
 * 在那之前调 play() 直接丢掉、不排队 —— 排队的结果是手势一到，
 * 攒下来的十几声一起炸出来。
 */

// ── 底座 ──────────────────────────────────────────────────

/** 总音量。桌上的声音该在讲解声底下，不是盖过它。 */
const MASTER = 0.55;

type Engine = {
  ac: AudioContext;
  /** 所有音效汇总到这里 —— 静音只动这一个值 */
  master: GainNode;
  /** 粉噪声缓冲。纸张摩擦、绒面拍击、洗牌都从它来 */
  noise: AudioBuffer;
};

let engine: Engine | null = null;

// ── 静音开关 ──────────────────────────────────────────────
/*
 * 静音状态归这个模块管，不归 React 管。
 *
 * 理由：它本来就是个外部系统的状态（一个 GainNode 的值 + 一条 localStorage 记录），
 * React 只是需要知道它以便画对喇叭图标。所以这里出 subscribe/getMuted，
 * 组件那边用 useSyncExternalStore 订阅 —— 和 useReducedMotion 订阅媒体查询是同一回事。
 *
 * 反过来（React 存 state、这里跟着改）会多一处真值，两边迟早不同步。
 */

const KEY = "hebutong.muted";

/** 开局就从 localStorage 取。
 *
 *  为什么在模块初始化时读：路演现场常常是先静音、调好投影仪、再刷新页面重开一局。
 *  等到某个组件挂载后再读，中间那几百毫秒会突然出声 —— 那一下在会场里很难看。
 *
 *  服务端（静态导出时）没有 window，一律 false；客户端首帧靠
 *  useSyncExternalStore 的 getServerSnapshot 对齐，挂载后立刻纠正。 */
function stored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // 隐私模式下 localStorage 会抛
    return false;
  }
}

let muted = stored();

const listeners = new Set<() => void>();

export function subscribeMuted(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getMuted(): boolean {
  return muted;
}

/** 静态导出时首帧一律按「不静音」画。猜错的代价只是喇叭图标闪一下 ——
 *  而在那一刻之前根本还没有声音可放（引擎要等用户手势）。 */
export function getServerMuted(): boolean {
  return false;
}

/**
 * 粉噪声，两秒够循环。
 *
 * 用粉噪声而不是纯白噪声：白噪声高频太多，听着像电流嘶声；
 * 粉噪声每倍频程能量相同，接近纸张、布料这类真实材质的摩擦声。
 * 这里用 Voss-McCartney 的简化版（七级递推），比走一遍滤波器便宜。
 */
function pinkNoise(ac: AudioContext): AudioBuffer {
  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const out = buf.getChannelData(0);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

/** 建引擎。只能在用户手势里调 —— 别处调了会被浏览器挂成 suspended。 */
function ensure(): Engine | null {
  if (engine) return engine;
  if (typeof window === "undefined") return null;

  const Ctor = window.AudioContext ?? (window as unknown as {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;
  if (!Ctor) return null;

  try {
    const ac = new Ctor();
    const master = ac.createGain();
    master.gain.value = muted ? 0 : MASTER;
    master.connect(ac.destination);
    engine = { ac, master, noise: pinkNoise(ac) };
    return engine;
  } catch {
    // 没有音频设备、或者被策略挡了。整套声音是增强，不该因此挂掉画面。
    return null;
  }
}

/**
 * 页面切后台再回来，Chrome 会把 context 挂起。
 * 每次发声前顺手唤醒一下 —— resume() 是幂等的，多调没事。
 */
function wake(e: Engine) {
  if (e.ac.state === "suspended") void e.ac.resume();
}

export function setMuted(next: boolean) {
  if (next === muted) return;
  muted = next;

  try {
    window.localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // 存不上就算了，本次会话内仍然生效
  }

  const e = engine;
  if (e) {
    // 不要瞬切，会「啪」一声。20ms 的斜坡听不出来，但没有爆音。
    e.master.gain.cancelScheduledValues(e.ac.currentTime);
    e.master.gain.setTargetAtTime(next ? 0 : MASTER, e.ac.currentTime, 0.02);
  }

  for (const fn of listeners) fn();
}

export function toggleMuted() {
  setMuted(!muted);
  // 取消静音时给一声反馈，否则没法确认喇叭通了
  if (!muted) {
    startAmbience();
    play("click");
  }
}

// ── 两块积木 ──────────────────────────────────────────────
// 底下所有音效都是这两个函数叠出来的：一个出音高，一个出摩擦。

type ToneSpec = {
  /** 起始频率，Hz */
  f: number;
  /** 终止频率。给了就做滑音 —— 上滑是「起来了」，下滑是「沉下去」 */
  to?: number;
  /** 峰值音量，0~1 */
  gain: number;
  /** 起音时长，秒。越短越硬 */
  attack?: number;
  /** 衰减到静音的时长，秒 */
  decay: number;
  type?: OscillatorType;
  /** 相对现在延后多少秒发 */
  at?: number;
};

function tone(e: Engine, s: ToneSpec) {
  const t = e.ac.currentTime + (s.at ?? 0);
  const osc = e.ac.createOscillator();
  const g = e.ac.createGain();

  osc.type = s.type ?? "sine";
  osc.frequency.setValueAtTime(s.f, t);
  // 指数滑音而不是线性 —— 人耳听音高是对数的，线性滑起来前半段几乎没动、后半段猛冲
  if (s.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, s.to), t + s.decay);
  }

  const a = s.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(s.gain, t + a);
  // 指数衰减到 0.0001 而不是 0：exponentialRamp 到 0 是非法值，会被忽略掉，
  // 音就一直挂着不消失。
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + s.decay);

  osc.connect(g).connect(e.master);
  osc.start(t);
  osc.stop(t + a + s.decay + 0.02);
}

type NoiseSpec = {
  gain: number;
  decay: number;
  /** 带通中心频率 —— 决定摩擦声的「材质」。纸张高，绒面低 */
  band: number;
  /** 带宽的倒数。大 = 窄 = 更像敲击，小 = 宽 = 更像沙沙声 */
  q?: number;
  /** 中心频率的终点，做扫频。洗牌、抬卡那种「唰」的方向感靠它 */
  bandTo?: number;
  attack?: number;
  at?: number;
};

function noiseBurst(e: Engine, s: NoiseSpec) {
  const t = e.ac.currentTime + (s.at ?? 0);
  const src = e.ac.createBufferSource();
  const bp = e.ac.createBiquadFilter();
  const g = e.ac.createGain();

  src.buffer = e.noise;
  src.loop = true;
  // 每次从缓冲里的随机位置起播 —— 同一个音效连点两下不会一模一样。
  // 真实的东西没有两次响得完全相同，这一点比音色本身更影响「真不真」。
  const offset = Math.random() * (e.noise.duration - s.decay - 0.05);

  bp.type = "bandpass";
  bp.Q.value = s.q ?? 1.2;
  bp.frequency.setValueAtTime(s.band, t);
  if (s.bandTo !== undefined) {
    bp.frequency.exponentialRampToValueAtTime(Math.max(20, s.bandTo), t + s.decay);
  }

  const a = s.attack ?? 0.003;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(s.gain, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + s.decay);

  src.connect(bp).connect(g).connect(e.master);
  src.start(t, Math.max(0, offset));
  src.stop(t + a + s.decay + 0.02);
}

// ── 音效表 ────────────────────────────────────────────────
/*
 * 每个音效都是「一个动作发出的声音」，不是提示音。
 * 判断标准：闭上眼睛听，能说出桌上刚发生了什么。
 *
 * 三态的音色必须彼此不同，而且不同在音程上，不在音量上：
 *   生效  = 纯五度往上（220→330），协和、有落点
 *   无效  = 单音、没有第二个音（没有解决，就是它的意思）
 *   反噬  = 小二度撞在一起（220+233）+ 往下沉的低频，永远不协和
 * 这样即便投影仪的音箱糊成一团，三者还是分得开。
 */

export type Sfx =
  | "lift"      // 从桌上捏起一张卡
  | "place"     // 放到某个提问者面前
  | "discard"   // 丢进弃牌区
  | "toHand"    // 拿回手上
  | "raise"     // 举到眼前读
  | "lower"     // 放回去
  | "hover"     // 拖着的卡扫过一个落点
  | "settle"    // 点下结算
  | "effective"
  | "ineffective"
  | "backfire"
  | "chip"      // 筹码磕在绒面上
  | "tighten"   // 反噬那一下描边收紧
  | "done"      // 三格讲完
  | "reset"     // 洗牌重来
  | "click";    // 桌沿的按钮

export function play(name: Sfx) {
  const e = ensure();
  if (!e || muted) return;
  wake(e);

  switch (name) {
    // 纸从绒面上刮起来：一层窄带摩擦，高频往上扫一点，像纸边翘起
    case "lift":
      noiseBurst(e, { gain: 0.3, decay: 0.11, band: 1700, bandTo: 3200, q: 0.8 });
      tone(e, { f: 300, to: 420, gain: 0.05, decay: 0.07, type: "triangle" });
      break;

    /*
     * 放下一张卡 = 三件事同时发生：纸拍在绒面上、桌板被敲了一下、绒面吸掉尾音。
     * 少任何一样都会变成「界面音」：只有噪声是纸片掉地上，只有低频是敲门。
     */
    case "place":
      noiseBurst(e, { gain: 0.34, decay: 0.055, band: 900, bandTo: 420, q: 0.7 });
      tone(e, { f: 128, to: 74, gain: 0.3, decay: 0.14, type: "sine" });
      tone(e, { f: 196, gain: 0.06, decay: 0.05, type: "triangle", at: 0.004 });
      break;

    // 弃牌：同样的动作，但更闷、更低，而且没有那记清脆的中频 —— 丢掉不是放下
    case "discard":
      noiseBurst(e, { gain: 0.26, decay: 0.08, band: 520, bandTo: 240, q: 0.6 });
      tone(e, { f: 96, to: 52, gain: 0.26, decay: 0.2, type: "sine" });
      break;

    // 拿回手上：place 倒过来 —— 频率往上走，尾巴短
    case "toHand":
      noiseBurst(e, { gain: 0.22, decay: 0.09, band: 700, bandTo: 1500, q: 0.8 });
      tone(e, { f: 150, to: 210, gain: 0.1, decay: 0.09, type: "triangle" });
      break;

    // 举到眼前：一记长一点的「唰」+ 一声软铃。铃是给「现在这张卡是全场焦点」用的
    case "raise":
      noiseBurst(e, { gain: 0.2, decay: 0.19, band: 1100, bandTo: 2900, q: 0.7, attack: 0.03 });
      tone(e, { f: 660, gain: 0.055, decay: 0.4, type: "sine", attack: 0.02 });
      tone(e, { f: 990, gain: 0.03, decay: 0.3, type: "sine", attack: 0.03, at: 0.02 });
      break;

    case "lower":
      noiseBurst(e, { gain: 0.17, decay: 0.13, band: 1600, bandTo: 620, q: 0.7 });
      tone(e, { f: 330, to: 220, gain: 0.04, decay: 0.12, type: "sine" });
      break;

    /*
     * 扫过落点。这个音会连着响很多次（指针在三个槽之间来回），所以必须极短极轻 ——
     * 它是触觉反馈，不是通知。超过 40ms 或者有音高，拖一次卡就成了一串风铃。
     */
    case "hover":
      tone(e, { f: 1480, gain: 0.028, decay: 0.03, type: "sine" });
      noiseBurst(e, { gain: 0.05, decay: 0.022, band: 3400, q: 2.5 });
      break;

    /*
     * 点结算。全场最大的一下，四层叠起来：
     *   1. 一记上扫的吸气声 —— 「要来了」
     *   2. 低音锣：三个略微失谐的低频叠在一起。失谐是关键，
     *      完全同频的三个正弦听起来只是一个响一点的正弦；差几个 Hz 才有拍频，
     *      那种缓慢的搏动就是金属体的声音。
     *   3. 一记下坠的超低频，压住整屏
     *   4. 长尾的堂音，让声音「散在房间里」而不是「从音箱里出来」
     */
    case "settle":
      noiseBurst(e, { gain: 0.16, decay: 0.26, band: 380, bandTo: 2600, q: 0.5, attack: 0.2 });
      for (const [f, g, d] of [[104, 0.26, 1.5], [131, 0.2, 1.3], [156.5, 0.13, 1.1]] as const) {
        tone(e, { f, gain: g, decay: d, type: "sine", attack: 0.008, at: 0.24 });
      }
      tone(e, { f: 78, to: 40, gain: 0.3, decay: 0.9, type: "sine", at: 0.24 });
      noiseBurst(e, { gain: 0.09, decay: 1.1, band: 520, bandTo: 180, q: 0.45, attack: 0.05, at: 0.25 });
      break;

    /*
     * 生效：纯五度往上（220 → 330）。协和、往上、有落点 —— 「这一步是对的」。
     * 上面再叠一个八度泛音，让它在投影仪音箱上也亮得出来。
     */
    case "effective":
      tone(e, { f: 220, gain: 0.17, decay: 0.5, type: "sine", attack: 0.006 });
      tone(e, { f: 330, gain: 0.15, decay: 0.62, type: "sine", attack: 0.01, at: 0.09 });
      tone(e, { f: 660, gain: 0.055, decay: 0.5, type: "sine", attack: 0.02, at: 0.1 });
      noiseBurst(e, { gain: 0.07, decay: 0.1, band: 1500, bandTo: 3000, q: 1 });
      break;

    /*
     * 无效：一个音，没有第二个。
     * 三角波 + 低通感的窄带噪声，钝、平、不解决 —— 声音本身就是「没发生什么」。
     * 刻意不给泛音也不给滑音：任何方向感都会让它听起来像个结果。
     */
    case "ineffective":
      tone(e, { f: 174, gain: 0.14, decay: 0.34, type: "triangle", attack: 0.012 });
      noiseBurst(e, { gain: 0.08, decay: 0.2, band: 420, q: 0.9, attack: 0.02 });
      break;

    /*
     * 反噬：整套声音里唯一不协和的一下，也是最重的一下。
     *   1. 小二度撞音（220 + 233）—— 两个音差 13Hz，拍频每秒十几次，听着就是「不对」
     *   2. 往下沉的超低频，和生效的上滑正好反向
     *   3. 一记金属刮擦（窄带高频往下扫），像描边被收紧的那声「嘎」
     *   4. 半秒后一记闷响落底 —— 对应视觉上那一顿
     */
    case "backfire":
      tone(e, { f: 220, gain: 0.17, decay: 1.0, type: "sine", attack: 0.005 });
      tone(e, { f: 233, gain: 0.17, decay: 1.0, type: "sine", attack: 0.005 });
      tone(e, { f: 110, to: 46, gain: 0.3, decay: 1.2, type: "sine", attack: 0.01 });
      noiseBurst(e, { gain: 0.2, decay: 0.42, band: 3000, bandTo: 700, q: 3.5 });
      tone(e, { f: 88, to: 55, gain: 0.22, decay: 0.5, type: "sine", at: 0.5 });
      noiseBurst(e, { gain: 0.13, decay: 0.3, band: 300, bandTo: 130, q: 0.6, at: 0.5 });
      break;

    // 筹码磕在绒面上：硬、短、带一点木头味的中频。比 place 脆，因为它不是纸
    case "chip":
      tone(e, { f: 420, to: 260, gain: 0.13, decay: 0.075, type: "triangle" });
      noiseBurst(e, { gain: 0.15, decay: 0.045, band: 2100, bandTo: 900, q: 1.6 });
      tone(e, { f: 116, gain: 0.12, decay: 0.1, type: "sine" });
      break;

    // 描边收紧。一记极短的金属「嘁」，没有低频 —— 它是个细节，不是事件
    case "tighten":
      noiseBurst(e, { gain: 0.17, decay: 0.05, band: 4600, bandTo: 2200, q: 5 });
      tone(e, { f: 1760, to: 1320, gain: 0.05, decay: 0.055, type: "sine" });
      break;

    // 讲完了。一记很轻的落定音，把上面那些悬着的东西收回来
    case "done":
      tone(e, { f: 147, gain: 0.1, decay: 0.8, type: "sine", attack: 0.05 });
      tone(e, { f: 220, gain: 0.06, decay: 0.7, type: "sine", attack: 0.07, at: 0.05 });
      break;

    /*
     * 洗牌。四段错开的摩擦，每段自己扫频 —— 一次「唰啦啦」，不是四声「唰」。
     * 间隔刻意不均匀（0 / 55 / 130 / 190）：均匀的间隔听起来像机器，
     * 手洗牌永远是不均匀的。
     */
    case "reset":
      for (const [at, band] of [[0, 1500], [0.055, 2000], [0.13, 1700], [0.19, 2400]] as const) {
        noiseBurst(e, { gain: 0.17, decay: 0.1, band, bandTo: band * 0.45, q: 0.8, at });
      }
      tone(e, { f: 180, to: 120, gain: 0.09, decay: 0.28, type: "sine", at: 0.02 });
      break;

    // 按钮。木头上敲一下，不是电子音
    case "click":
      tone(e, { f: 520, to: 380, gain: 0.075, decay: 0.045, type: "triangle" });
      noiseBurst(e, { gain: 0.07, decay: 0.03, band: 1800, q: 2 });
      break;
  }
}

// ── 底噪：一直在响的那一层 ─────────────────────────────────
/*
 * 一间有房间感的屋子，桌上吊着一盏灯。
 *
 * ── 为什么需要它 ──
 * 只有音效的话，每一下都是从绝对的寂静里冒出来的 —— 那是网页，不是房间。
 * 底噪一铺上，音效就变成「在这个房间里发生的事」。
 * 它必须低到没人会注意，但一关掉所有人都会觉得空了。
 *
 * ── 张力 ──
 * 配满三张卡之后底噪会往上抬一点（滤波器打开、加一个高一点的分音），
 * 点结算那一刻抬到最高，讲完落回来。这是整个氛围里唯一「会变」的东西 ——
 * 玩家说不出哪里变了，但会觉得越到后面越紧。
 */

type Ambience = {
  /** 张力：0 = 空桌，1 = 正在揭示 */
  setTension: (v: number) => void;
  stop: () => void;
};

let ambience: Ambience | null = null;

const AMB_BASE = 0.055;

export function startAmbience(): Ambience | null {
  if (ambience) return ambience;
  const e = ensure();
  if (!e) return null;
  wake(e);

  const { ac } = e;
  const t0 = ac.currentTime;

  /** 总口。淡入两秒 —— 突然出现的底噪等于一声噪音 */
  const bus = ac.createGain();
  bus.gain.setValueAtTime(0.0001, t0);
  bus.gain.exponentialRampToValueAtTime(AMB_BASE, t0 + 2);
  bus.connect(e.master);

  /** 房间的空气声。低通到 500Hz 以下，就只剩「屋子里有空气」这一层 */
  const air = ac.createBufferSource();
  const airLp = ac.createBiquadFilter();
  const airGain = ac.createGain();
  air.buffer = e.noise;
  air.loop = true;
  airLp.type = "lowpass";
  airLp.frequency.value = 480;
  airGain.gain.value = 0.5;
  air.connect(airLp).connect(airGain).connect(bus);
  air.start(t0);

  /*
   * 低音持续音。两个差 0.3Hz 的振荡器 —— 每三秒多一次缓慢的强弱起伏。
   * 这个拍频就是「氛围在呼吸」的听觉版本，和画面上那层呼吸的光同一件事。
   */
  const droneLp = ac.createBiquadFilter();
  droneLp.type = "lowpass";
  droneLp.frequency.setValueAtTime(220, t0);
  droneLp.Q.value = 0.7;
  droneLp.connect(bus);

  const oscs: OscillatorNode[] = [];
  for (const [f, g] of [[55, 0.5], [55.3, 0.5], [82.5, 0.12], [110, 0.07]] as const) {
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.type = "sine";
    o.frequency.value = f;
    og.gain.value = g;
    o.connect(og).connect(droneLp);
    o.start(t0);
    oscs.push(o);
  }

  /*
   * 慢速摆动的滤波器。周期 17 秒 —— 刻意取一个跟画面上任何动画都不成整数比的值，
   * 声音和画面才不会周期性地「对上」，那种对齐会让人听出这是个循环。
   */
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.type = "sine";
  lfo.frequency.value = 1 / 17;
  lfoGain.gain.value = 90;
  lfo.connect(lfoGain).connect(droneLp.frequency);
  lfo.start(t0);

  const api: Ambience = {
    setTension(v) {
      const x = Math.min(1, Math.max(0, v));
      const now = ac.currentTime;
      // setTargetAtTime 而不是 ramp：张力是「渐渐变紧」，
      // 到不到目标值不重要，重要的是没有台阶。
      droneLp.frequency.setTargetAtTime(220 + x * 520, now, 1.2);
      bus.gain.setTargetAtTime(AMB_BASE * (1 + x * 1.1), now, 1.2);
      airLp.frequency.setTargetAtTime(480 + x * 900, now, 1.5);
    },
    stop() {
      const now = ac.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0.0001, now, 0.3);
      const end = now + 1.5;
      for (const o of oscs) o.stop(end);
      lfo.stop(end);
      air.stop(end);
      ambience = null;
    },
  };

  ambience = api;
  return api;
}

export function setTension(v: number) {
  ambience?.setTension(v);
}

export function stopAmbience() {
  ambience?.stop();
}
