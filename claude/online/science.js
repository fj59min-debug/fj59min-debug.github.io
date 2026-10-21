/* 自然科学・数学の道具: 物理の公式計算 / 微積分 / 統計 / 2次方程式 / 概念辞典
 * Science.answer(text) → {text, wiki?:string} | null    （wiki: ja.wikipedia の記事名。画面側で実在確認して出典を付ける）
 * 定数は SI 2019 改定の定義値と CODATA 2018 の G を使用。
 */
(function (root) {
"use strict";
const C = 299792458, H = 6.62607015e-34, K_B = 1.380649e-23, QE = 1.602176634e-19, NA = 6.02214076e23;
const R_GAS = NA * K_B;                 // 8.31446261815324 J/(mol·K)（厳密）
const G_GRAV = 6.67430e-11;            // 万有引力定数 CODATA 2018（標準不確かさ 0.00015e-11）
const G_STD = 9.80665;                 // 標準重力加速度（定義値）
const AU = 149597870700;               // 天文単位（定義値）

const zen2han = s => s.replace(/[０-９．，－＋＊／（）％＾＝]/g, c => ({ "．": ".", "，": ",", "－": "-", "＋": "+", "＊": "*", "／": "/", "（": "(", "）": ")", "％": "%", "＾": "^", "＝": "=" }[c] || String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
function sig(n, d = 4) {
  if (!isFinite(n)) return String(n);
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1e6 || a < 1e-3) { const [m, e] = n.toExponential(d - 1).split("e"); return `${m.replace(/\.?0+$/, "")}×10^${parseInt(e, 10)}`; }
  return String(Number(n.toPrecision(d)));
}

// ---------- 単位つき数値の抽出 ----------
// [表記, 量の種類, SIへの倍率]。英字の表記は大文字小文字を区別し、直後が英字なら不一致
const UNITS = [
  ["m/s²", "accel", 1], ["m/s2", "accel", 1], ["km/h", "speed", 1 / 3.6], ["m/s", "speed", 1], ["c", "speedc", C],
  ["kg", "mass", 1], ["mg", "mass", 1e-6], ["g", "mass", 1e-3], ["t", "mass", 1e3],
  ["AU", "length", AU], ["km", "length", 1e3], ["cm", "length", 1e-2], ["mm", "length", 1e-3], ["nm", "length", 1e-9], ["μm", "length", 1e-6], ["m", "length", 1],
  ["kHz", "freq", 1e3], ["MHz", "freq", 1e6], ["GHz", "freq", 1e9], ["THz", "freq", 1e12], ["Hz", "freq", 1],
  ["kΩ", "res", 1e3], ["Ω", "res", 1], ["オーム", "res", 1], ["ohm", "res", 1],
  ["mA", "cur", 1e-3], ["A", "cur", 1], ["kV", "volt", 1e3], ["V", "volt", 1],
  ["kW", "power", 1e3], ["W", "power", 1], ["kJ", "energy", 1e3], ["J", "energy", 1], ["eV", "energyev", QE],
  ["kPa", "press", 1e3], ["atm", "press", 101325], ["Pa", "press", 1],
  ["mol", "amount", 1], ["K", "tempK", 1], ["℃", "tempC", 1], ["°C", "tempC", 1],
  ["m³", "volume", 1], ["m3", "volume", 1], ["mL", "volume", 1e-6], ["L", "volume", 1e-3],
  ["N", "force", 1],
  ["秒", "time", 1], ["min", "time", 60], ["分", "time", 60], ["時間", "time", 3600], ["年", "timeyr", 365.25 * 86400], ["s", "time", 1],
];
const NUM = "(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?(?:\\s*[×x]\\s*10\\^\\(?-?\\d+\\)?)?)";
function parseNum(s) {
  const m = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*[×x]\s*10\^\(?(-?\d+)\)?$/.exec(s.replace(/\s+/g, ""));
  return m ? parseFloat(m[1]) * Math.pow(10, +m[2]) : parseFloat(s);
}
function qtys(text) {
  const t = zen2han(text).replace(/(\d)\s+(?=[A-Za-zΩμ℃°㎏])/g, "$1");
  const out = {}; const re = new RegExp(NUM + "\\s*", "g"); let m;
  const sorted = UNITS.slice().sort((a, b) => b[0].length - a[0].length);
  while ((m = re.exec(t))) {
    const pos = m.index + m[0].length;
    for (const [u, kind, f] of sorted) {
      if (!t.startsWith(u, pos)) continue;
      if (/^[A-Za-z]/.test(u) && /[A-Za-z]/.test(t[pos + u.length] || "")) continue;
      if (u === "t" && /[a-z]/.test(t[pos + 1] || "")) continue;
      let v = parseNum(m[1]) * f;
      if (kind === "tempC") { v = parseNum(m[1]) + 273.15; (out.temp = out.temp || []).push({ v, raw: `${m[1]}${u}` }); }
      else if (kind === "tempK") { (out.temp = out.temp || []).push({ v: parseNum(m[1]), raw: `${m[1]} K` }); }
      else { const k = kind === "speedc" ? "speed" : kind === "energyev" ? "energy" : kind === "timeyr" ? "time" : kind; (out[k] = out[k] || []).push({ v, raw: `${m[1]} ${u}` }); }
      re.lastIndex = pos + u.length; break;
    }
  }
  return out;
}

// ---------- 天体データ（概算。NASA/IAUの代表値を有効数字4桁程度で使用） ----------
const BODIES = { 地球: { M: 5.9722e24, R: 6.371e6 }, 月: { M: 7.342e22, R: 1.7374e6 }, 火星: { M: 6.4171e23, R: 3.3895e6 }, 木星: { M: 1.8982e27, R: 7.1492e7 }, 太陽: { M: 1.98841e30, R: 6.957e8 } };

// ---------- 物理の公式計算 ----------
function physics(text) {
  const t = zen2han(text); const q = qtys(t); const one = k => q[k] && q[k][0];
  const need = (what, ex) => ({ text: `${what}が必要です。例: ${ex}` });
  let m;
  if (/(e\s*=\s*mc|E=mc|質量とエネルギー|質量.*エネルギー.*(換算|等価)|エネルギー.*(換算|等価).*質量)/i.test(t) && one("mass")) {
    const E = one("mass").v * C * C; return { text: `E = mc² = ${one("mass").raw} × (c)² = ${sig(E)} J（c = 299 792 458 m/s）`, wiki: "質量とエネルギーの等価性" };
  }
  if (/(脱出速度|第二宇宙速度|第一宇宙速度|宇宙速度)/.test(t)) {
    const b = Object.keys(BODIES).find(n => t.includes(n)); if (!b) return need("天体名（地球・月・火星・木星・太陽）", "「地球の脱出速度」");
    const { M, R } = BODIES[b]; const first = /第一宇宙速度/.test(t); const v = first ? Math.sqrt(G_GRAV * M / R) : Math.sqrt(2 * G_GRAV * M / R);
    return { text: `${b}の${first ? "第一宇宙速度（地表すれすれの円軌道）" : "脱出速度（第二宇宙速度）"}\n${first ? "v = √(GM/R)" : "v = √(2GM/R)"} ≈ ${sig(v / 1000, 4)} km/s（G = 6.6743×10⁻¹¹、M・Rは概算値、大気抵抗は無視）`, wiki: first ? "宇宙速度" : "脱出速度" };
  }
  if (/(表面重力|重力加速度).*(地球|月|火星|木星|太陽)|(地球|月|火星|木星|太陽).*(表面重力|重力加速度)/.test(t)) {
    const b = Object.keys(BODIES).find(n => t.includes(n)); const { M, R } = BODIES[b]; return { text: `${b}の表面重力加速度 g = GM/R² ≈ ${sig(G_GRAV * M / (R * R), 3)} m/s²（概算。自転による遠心力は無視）` };
  }
  if (/(公転周期|ケプラー)/.test(t) && one("length") && /AU/.test(one("length").raw)) {
    const a = one("length").v / AU; return { text: `ケプラーの第3法則: T² = a³（太陽のまわり、年・AU単位）\n軌道長半径 ${sig(a)} AU → 公転周期 T = ${sig(Math.pow(a, 1.5))} 年`, wiki: "ケプラーの法則" };
  }
  if (/(万有引力)/.test(t) && q.mass && q.mass.length >= 2 && one("length")) {
    const F = G_GRAV * q.mass[0].v * q.mass[1].v / Math.pow(one("length").v, 2);
    return { text: `万有引力 F = G·m₁m₂/r² = 6.6743×10⁻¹¹ × ${q.mass[0].raw} × ${q.mass[1].raw} / (${one("length").raw})² = ${sig(F)} N`, wiki: "万有引力" };
  }
  if (/(運動エネルギー)/.test(t)) {
    if (!one("mass") || !one("speed")) return need("質量と速さ", "「2kgの物体が3m/sで動くときの運動エネルギー」");
    const E = 0.5 * one("mass").v * Math.pow(one("speed").v, 2); return { text: `運動エネルギー K = ½mv² = ½ × ${one("mass").raw} × (${one("speed").raw})² = ${sig(E)} J`, wiki: "運動エネルギー" };
  }
  if (/(位置エネルギー|ポテンシャルエネルギー)/.test(t)) {
    if (!one("mass") || !one("length")) return need("質量と高さ", "「10kgの物体が5mの高さにあるときの位置エネルギー」");
    const E = one("mass").v * G_STD * one("length").v; return { text: `重力による位置エネルギー U = mgh = ${one("mass").raw} × 9.80665 m/s² × ${one("length").raw} = ${sig(E)} J`, wiki: "位置エネルギー" };
  }
  if (/運動量/.test(t) && !/保存/.test(t)) {
    if (!one("mass") || !one("speed")) return need("質量と速さ", "「2kgで3m/sの運動量」");
    return { text: `運動量 p = mv = ${one("mass").raw} × ${one("speed").raw} = ${sig(one("mass").v * one("speed").v)} kg·m/s`, wiki: "運動量" };
  }
  if (/(ド・?ブロイ|物質波)/.test(t)) {
    if (!one("mass") || !one("speed")) return need("質量と速さ", "「0.001kg 1m/s のド・ブロイ波長」");
    return { text: `ド・ブロイ波長 λ = h/(mv) = 6.62607015×10⁻³⁴ / (${one("mass").raw} × ${one("speed").raw}) = ${sig(H / (one("mass").v * one("speed").v))} m`, wiki: "ド・ブロイ波" };
  }
  if (/(光子|フォトン|光のエネルギー)/.test(t) && (one("length") || one("freq"))) {
    const E = one("freq") ? H * one("freq").v : H * C / one("length").v;
    return { text: `光子のエネルギー ${one("freq") ? "E = hf" : "E = hc/λ"} = ${sig(E)} J = ${sig(E / QE)} eV`, wiki: "光子" };
  }
  if (/波長/.test(t) && one("freq") && !/光子/.test(t)) {
    const l = C / one("freq").v; return { text: `電磁波（真空中）の波長 λ = c/f = 299 792 458 / ${one("freq").raw} = ${sig(l)} m（= ${sig(l * 100)} cm）` };
  }
  if (/(周波数|振動数)/.test(t) && one("length") && /波長|光|電波/.test(t)) {
    return { text: `電磁波（真空中）の周波数 f = c/λ = 299 792 458 / ${one("length").raw} = ${sig(C / one("length").v)} Hz` };
  }
  if (/(オーム|電流|電圧|抵抗)/.test(t) && (one("volt") || one("cur") || one("res")) && !/電力/.test(t)) {
    const V = one("volt"), I = one("cur"), Rr = one("res");
    if (V && Rr) return { text: `オームの法則 I = V/R = ${V.raw} / ${Rr.raw} = ${sig(V.v / Rr.v)} A`, wiki: "オームの法則" };
    if (I && Rr) return { text: `オームの法則 V = IR = ${I.raw} × ${Rr.raw} = ${sig(I.v * Rr.v)} V`, wiki: "オームの法則" };
    if (V && I) return { text: `オームの法則 R = V/I = ${V.raw} / ${I.raw} = ${sig(V.v / I.v)} Ω`, wiki: "オームの法則" };
  }
  if (/電力|消費電力|ワット/.test(t) && ((one("volt") && one("cur")) || (one("cur") && one("res")) || (one("volt") && one("res")))) {
    const V = one("volt"), I = one("cur"), Rr = one("res");
    if (V && I) return { text: `電力 P = VI = ${V.raw} × ${I.raw} = ${sig(V.v * I.v)} W`, wiki: "電力" };
    if (I && Rr) return { text: `電力 P = I²R = (${I.raw})² × ${Rr.raw} = ${sig(I.v * I.v * Rr.v)} W`, wiki: "電力" };
    return { text: `電力 P = V²/R = (${V.raw})² / ${Rr.raw} = ${sig(V.v * V.v / Rr.v)} W`, wiki: "電力" };
  }
  if (/(理想気体|状態方程式|PV=nRT|pv=nrt)/i.test(t)) {
    const n = one("amount"), T = one("temp"), V = one("volume"), P = one("press");
    if (n && T && V) { const p = n.v * R_GAS * T.v / V.v; return { text: `理想気体 PV = nRT より P = nRT/V = ${n.raw} × 8.314462618 × ${sig(T.v, 5)} K / ${sig(V.v, 5)} m³ = ${sig(p, 6)} Pa（= ${sig(p / 101325, 4)} atm）`, wiki: "理想気体の状態方程式" }; }
    if (P && T && V) { const nn = P.v * V.v / (R_GAS * T.v); return { text: `理想気体 PV = nRT より n = PV/(RT) = ${sig(nn)} mol`, wiki: "理想気体の状態方程式" }; }
    return need("物質量(mol)・温度(K か ℃)・体積(L か m³)", "「1mol 273.15K 22.414L の理想気体の圧力」");
  }
  if (/自由落下|落下.*(時間|速度)|落と(した|す)/.test(t)) {
    const h = one("length"); if (!h) return need("高さ", "「10mの高さから自由落下する時間」");
    const tt = Math.sqrt(2 * h.v / G_STD), v = G_STD * tt; return { text: `自由落下（空気抵抗なし, g = 9.80665 m/s²）\n落下時間 t = √(2h/g) = ${sig(tt)} s\n着地速度 v = gt = √(2gh) = ${sig(v)} m/s（= ${sig(v * 3.6)} km/h）`, wiki: "自由落下" };
  }
  if (/(単振り子|振り子)/.test(t) && one("length")) {
    const T = 2 * Math.PI * Math.sqrt(one("length").v / G_STD); return { text: `単振り子の周期（微小振幅）T = 2π√(L/g) = 2π√(${one("length").raw} / 9.80665) = ${sig(T)} s`, wiki: "振り子" };
  }
  if (/(等加速度|加速度)/.test(t) && one("accel") && one("time")) {
    const a = one("accel").v, tt = one("time").v, v0 = one("speed") ? one("speed").v : 0;
    return { text: `等加速度直線運動（初速度 ${sig(v0)} m/s${one("speed") ? "" : "＝静止から"}）\n速度 v = v₀ + at = ${sig(v0 + a * tt)} m/s\n移動距離 x = v₀t + ½at² = ${sig(v0 * tt + 0.5 * a * tt * tt)} m`, wiki: "等加速度直線運動" };
  }
  if (/(力|ニュートン)/.test(t) && /(F=ma|運動方程式|何N|力を)/i.test(t) && one("mass") && one("accel")) {
    return { text: `運動方程式 F = ma = ${one("mass").raw} × ${one("accel").raw} = ${sig(one("mass").v * one("accel").v)} N`, wiki: "運動方程式" };
  }
  if (/(ローレンツ因子|ローレンツ収縮|時間の遅れ|相対論|特殊相対性)/.test(t) && one("speed")) {
    const b = one("speed").v / C; if (b >= 1) return { text: "質量のある物体は光速に達しません（v < c が必要）。" };
    const g = 1 / Math.sqrt(1 - b * b);
    return { text: `速さ ${one("speed").raw}（β = v/c = ${sig(b, 6)}）\nローレンツ因子 γ = 1/√(1−β²) = ${sig(g)}\n動く時計は静止系から見て γ 倍だけゆっくり進み（時間の遅れ）、進行方向の長さは 1/γ に縮みます。`, wiki: "ローレンツ因子" };
  }
  if (/半減期/.test(t)) {
    const T = (/半減期\s*(\d+(?:\.\d+)?)/.exec(t) || [])[1]; const el = (/(?:経過|後|経った)\D{0,3}(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:年|日|時間|秒)?\s*(?:経過|後)/.exec(t) || []); const tt = el[1] || el[2];
    const n0 = (/(?:初期量|最初|はじめ)\D{0,3}(\d+(?:\.\d+)?)/.exec(t) || [])[1];
    if (T && tt) { const f = Math.pow(0.5, +tt / +T); return { text: `残る割合 = (1/2)^(t/T½) = (1/2)^(${tt}/${T}) = ${sig(f)}（${sig(f * 100)}%）${n0 ? `\n初期量 ${n0} → 残量 ${sig(f * +n0)}` : ""}`, wiki: "半減期" }; }
    return need("半減期と経過時間", "「半減期5730年で11460年経過したら残る割合」");
  }
  return null;
}

// ---------- 多項式の微分・積分 ----------
function parsePoly(src) {
  const s = zen2han(src).replace(/\s+/g, "").replace(/\*/g, "").replace(/[ー−]/g, "-").replace(/\*\*/g, "^");
  if (!s || !/^[0-9x.+\-^()]+$/.test(s) || s.includes("(")) return null;
  const terms = s.replace(/-/g, "+-").split("+").filter(Boolean); const co = {};
  for (const tm of terms) {
    const m = /^(-?)(\d+(?:\.\d+)?)?(x)?(?:\^(-?\d+))?$/.exec(tm); if (!m || (!m[2] && !m[3])) return null;
    if (m[4] && !m[3]) return null;
    const c = (m[1] ? -1 : 1) * (m[2] ? parseFloat(m[2]) : 1); const p = m[3] ? (m[4] !== undefined ? +m[4] : 1) : 0;
    co[p] = (co[p] || 0) + c;
  }
  return co;
}
const polyStr = (co, fn) => {
  const ps = Object.keys(co).map(Number).sort((a, b) => b - a).filter(p => Math.abs(co[p]) > 1e-12);
  if (!ps.length) return "0";
  return ps.map((p, i) => {
    const c = co[p], a = Math.abs(c), sign = c < 0 ? "-" : (i ? "+" : "");
    const cs = fn && fn.frac ? a : (a === 1 && p !== 0 ? "" : String(Number(a.toPrecision(10))));
    const body = p === 0 ? (cs || "1") : (p === 1 ? "x" : `x^${p}`);
    return `${i ? " " + sign + " " : sign}${p === 0 ? cs : cs + body}`;
  }).join("");
};
function calculus(text) {
  const t = zen2han(text); if (!/(微分|導関数|積分|不定積分)/.test(t)) return null;
  const m = /([0-9x.+\-^*\s]+)\s*(?:を|の)?\s*(微分|導関数|不定積分|積分)/.exec(t.replace(/f\(x\)\s*=\s*/i, "").replace(/y\s*=\s*/i, ""));
  if (!m) return null; const co = parsePoly(m[1]); if (!co) return null;
  const f = polyStr(co);
  if (/微分|導関数/.test(m[2])) {
    const d = {}; for (const p of Object.keys(co).map(Number)) if (p !== 0) d[p - 1] = (d[p - 1] || 0) + co[p] * p;
    return { text: `f(x) = ${f}\nf'(x) = ${polyStr(d)}\n（べき乗の微分 (xⁿ)' = n·xⁿ⁻¹）`, wiki: "導関数" };
  }
  if (Object.keys(co).some(p => +p === -1)) return { text: "x^-1 の積分は対数関数になります（ln|x|）。このツールはべき乗の項のみ対応です。" };
  const parts = Object.keys(co).map(Number).sort((a, b) => b - a).map(p => { const c = co[p] / (p + 1); return { p: p + 1, c }; }).filter(x => Math.abs(x.c) > 1e-12);
  const gcdI = (a, b) => b ? gcdI(b, a % b) : a;
  const frac = Object.keys(co).map(Number).sort((a, b) => b - a).filter(p => Math.abs(co[p]) > 1e-12).map((p, i) => {
    const n = p + 1, c = co[p], sign = c < 0 ? "-" : (i ? "+" : ""), a = Math.abs(c);
    const xs = n === 1 ? "x" : `x^${n}`; let term;
    if (Number.isInteger(a)) { const g = gcdI(a, n), num = a / g, den = n / g; term = den === 1 ? `${num === 1 ? "" : num}${xs}` : `${num === 1 ? "" : num}${xs}/${den}`; }
    else term = `${Number((a / n).toPrecision(10))}${xs}`;
    return `${i ? " " + sign + " " : sign}${term}`;
  }).join("");
  return { text: `f(x) = ${f}\n∫f(x)dx = ${frac || "0"} + C\n（べき乗の積分 ∫xⁿdx = xⁿ⁺¹/(n+1) + C、C は積分定数）`, wiki: "不定積分" };
}

// ---------- 2次方程式 / 統計 / 組み合わせ ----------
function quadratic(text) {
  const t = zen2han(text).replace(/\s+/g, "").replace(/\*/g, "").replace(/[ー−]/g, "-");
  const m = /([0-9x.+\-^]+)=0/.exec(t); if (!m || !/x\^2/.test(m[1]) || /x\^[3-9]/.test(m[1])) return null;
  const co = parsePoly(m[1]); if (!co) return null;
  const a = co[2] || 0, b = co[1] || 0, c = co[0] || 0; if (!a) return null;
  const D = b * b - 4 * a * c; const f = x => String(Number(x.toPrecision(10)));
  let res;
  if (D > 0) res = `x = ${f((-b + Math.sqrt(D)) / (2 * a))}, ${f((-b - Math.sqrt(D)) / (2 * a))}（異なる2つの実数解）`;
  else if (D === 0) res = `x = ${f(-b / (2 * a))}（重解）`;
  else res = `x = ${f(-b / (2 * a))} ± ${f(Math.sqrt(-D) / (2 * a < 0 ? -2 * a : 2 * a))}i（共役な複素数解）`;
  return { text: `${a}x² + ${b}x + ${c} = 0\n判別式 D = b² − 4ac = ${f(D)}\n解の公式 x = (−b ± √D)/(2a) より\n${res}`, wiki: "二次方程式" };
}
function stats(text) {
  const t = zen2han(text); if (!/(平均|中央値|最頻値|標準偏差|分散|統計|合計|データ)/.test(t)) return null;
  const body = t.replace(/(平均|中央値|最頻値|標準偏差|分散|統計|合計|データ|を|の|は|求めて|教えて|計算して|ください|:|：)/g, " ");
  const nums = (body.match(/-?\d+(?:\.\d+)?/g) || []).map(Number); if (nums.length < 2) return null;
  const n = nums.length, sum = nums.reduce((a, b) => a + b, 0), mean = sum / n, s = nums.slice().sort((a, b) => a - b);
  const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const cnt = {}; nums.forEach(x => cnt[x] = (cnt[x] || 0) + 1); const mx = Math.max(...Object.values(cnt));
  const mode = mx === 1 ? "なし（すべて1回）" : Object.keys(cnt).filter(k => cnt[k] === mx).join("、");
  const ss = nums.reduce((a, x) => a + (x - mean) ** 2, 0); const f = x => String(Number(x.toPrecision(8)));
  return { text: `データ: ${nums.join(", ")}（n = ${n}）\n合計 ${f(sum)} / 平均 ${f(mean)} / 中央値 ${f(med)} / 最頻値 ${mode}\n最小 ${f(s[0])} / 最大 ${f(s[n - 1])}\n分散: 母集団 ${f(ss / n)}、標本(不偏) ${f(ss / (n - 1))}\n標準偏差: 母集団 ${f(Math.sqrt(ss / n))}、標本(不偏) ${f(Math.sqrt(ss / (n - 1)))}`, wiki: "標準偏差" };
}
function comb(text) {
  const t = zen2han(text); let m;
  if ((m = /(\d+)\s*[CcＣ]\s*(\d+)/.exec(t)) || (m = /(\d+)\s*(?:個|人|種類)?\s*から\s*(\d+)\s*(?:個|人|つ)?\s*(?:を)?\s*選ぶ(?:組み合わせ|場合の数)?/.exec(t))) {
    const n = +m[1], r = +m[2]; if (r > n || n > 1000) return null; let c = 1n; for (let i = 1n; i <= BigInt(r); i++) c = c * (BigInt(n) - i + 1n) / i; return { text: `組み合わせ ${n}C${r} = n!/(r!(n−r)!) = ${c.toString()}`, wiki: "組合せ" };
  }
  if ((m = /(\d+)\s*[Pp]\s*(\d+)/.exec(t))) { const n = +m[1], r = +m[2]; if (r > n || n > 1000) return null; let c = 1n; for (let i = 0n; i < BigInt(r); i++) c *= BigInt(n) - i; return { text: `順列 ${n}P${r} = n!/(n−r)! = ${c.toString()}`, wiki: "順列" }; }
  return null;
}

// ---------- 学術概念の辞典（式つき） ----------
const KB = [
  { k: /ニュートンの(運動)?法則|運動の(三|3)法則|慣性の法則|運動方程式/, t: "ニュートンの運動の法則", b: "第1法則（慣性）: 力が働かなければ、物体は静止または等速直線運動を続ける。\n第2法則（運動方程式）: F = ma（力 = 質量 × 加速度）。\n第3法則（作用反作用）: 物体Aが物体Bに力を及ぼすと、Bは同じ大きさで逆向きの力をAに及ぼす。", wiki: "ニュートンの運動法則" },
  { k: /万有引力の法則/, t: "万有引力の法則", b: "質量 m₁, m₂ の2物体が距離 r 離れているとき、互いに引き合う力は F = G·m₁m₂/r²。\nG = 6.67430×10⁻¹¹ m³ kg⁻¹ s⁻²（CODATA 2018）。", wiki: "万有引力" },
  { k: /エネルギー(保存|の保存)/, t: "エネルギー保存則", b: "孤立系の全エネルギーは時間が経っても変わらない（形を変えるだけ）。力学では 運動エネルギー + 位置エネルギー = 一定（保存力のみが働く場合）。", wiki: "エネルギー保存の法則" },
  { k: /運動量保存/, t: "運動量保存則", b: "外力が働かない系では、全運動量 Σmv が保存される。衝突の前後で m₁v₁ + m₂v₂ = m₁v₁' + m₂v₂'。", wiki: "運動量保存の法則" },
  { k: /熱力学(の)?(第?(0|零|ゼロ|1|一|2|二|3|三)法則|法則)|熱力学第/, t: "熱力学の法則", b: "第0法則: 熱平衡は推移的（A=B, B=C ならA=C）。温度の定義の土台。\n第1法則: ΔU = Q − W（内部エネルギーの変化 = 吸収した熱 − 系がした仕事）。エネルギー保存則。\n第2法則: 孤立系のエントロピーは減少しない（ΔS ≥ 0）。熱は低温から高温へ自然には移らない。\n第3法則: 絶対零度でエントロピーは一定値（完全結晶では0）に近づく。", wiki: "熱力学" },
  { k: /エントロピー/, t: "エントロピー", b: "乱雑さ・状態の数の多さを表す量。熱力学では dS = δQ_rev / T。統計力学ではボルツマンの式 S = k_B ln W（W は状態数、k_B = 1.380649×10⁻²³ J/K）。孤立系では自然な変化でエントロピーは増える（熱力学第2法則）。", wiki: "エントロピー" },
  { k: /マクスウェル方程式/, t: "マクスウェル方程式（真空中・微分形）", b: "∇·E = ρ/ε₀（ガウスの法則）\n∇·B = 0（磁荷は存在しない）\n∇×E = −∂B/∂t（ファラデーの電磁誘導）\n∇×B = μ₀J + μ₀ε₀ ∂E/∂t（アンペール・マクスウェルの法則）\n結論: 電磁波の速さは c = 1/√(μ₀ε₀)。", wiki: "マクスウェルの方程式" },
  { k: /クーロンの法則/, t: "クーロンの法則", b: "2つの点電荷 q₁, q₂ が距離 r にあるとき、力は F = q₁q₂ / (4πε₀ r²)。同符号は反発、異符号は引力。", wiki: "クーロンの法則" },
  { k: /ファラデー|電磁誘導/, t: "ファラデーの電磁誘導の法則", b: "回路を貫く磁束 Φ が変化すると、起電力 ε = −dΦ/dt が生じる（マイナスはレンツの法則：変化を妨げる向き）。", wiki: "ファラデーの電磁誘導の法則" },
  { k: /ローレンツ力/, t: "ローレンツ力", b: "電荷 q が電場 E・磁場 B の中を速度 v で動くときに受ける力 F = q(E + v × B)。", wiki: "ローレンツ力" },
  { k: /特殊相対性理論|特殊相対論/, t: "特殊相対性理論（アインシュタイン, 1905）", b: "2つの原理: (1) 物理法則はすべての慣性系で同じ。(2) 真空中の光速 c はどの慣性系でも一定。\n結果: 時間の遅れ Δt = γΔt₀、長さの収縮 L = L₀/γ（γ = 1/√(1−v²/c²)）、質量とエネルギーの等価 E = mc²、E² = (pc)² + (mc²)²。", wiki: "特殊相対性理論" },
  { k: /一般相対性理論|一般相対論|アインシュタイン方程式/, t: "一般相対性理論（アインシュタイン, 1915）", b: "重力は時空の曲がりとして表される。アインシュタイン方程式: G_μν + Λg_μν = (8πG/c⁴) T_μν（左辺が時空の曲がり、右辺が物質・エネルギー）。予言: 光の重力曲がり、重力レンズ、重力波、ブラックホール、重力による時間の遅れ。", wiki: "一般相対性理論" },
  { k: /シュレ[ーディ]*ンガー方程式|シュレーディンガー/, t: "シュレーディンガー方程式", b: "量子力学の基本方程式。時間依存: iħ ∂ψ/∂t = Ĥψ。定常状態（時間に依存しない）: Ĥψ = Eψ。|ψ|² は粒子の見つかる確率密度。ħ = h/2π。", wiki: "シュレーディンガー方程式" },
  { k: /不確定性原理|不確定性関係/, t: "ハイゼンベルクの不確定性原理", b: "位置と運動量は同時に好きな精度では決められない: Δx·Δp ≥ ħ/2（ħ = h/2π）。測定の乱暴さではなく、量子状態そのものの性質。", wiki: "不確定性原理" },
  { k: /光電効果/, t: "光電効果", b: "金属に十分高い振動数の光を当てると電子が飛び出す現象。光は E = hf のエネルギーの粒（光子）として働き、最大運動エネルギーは K_max = hf − W（W は仕事関数）。f が限界振動数より小さいと、光が強くても電子は出ない。アインシュタイン（1905）。", wiki: "光電効果" },
  { k: /ド・?ブロイ/, t: "ド・ブロイ波（物質波）", b: "粒子は波の性質も持ち、波長は λ = h/p = h/(mv)。", wiki: "ド・ブロイ波" },
  { k: /パウリの排他原理/, t: "パウリの排他原理", b: "同種のフェルミ粒子（電子など）は、同じ量子状態を2つ以上とれない。原子の電子配置や物質の安定性の土台。", wiki: "パウリの排他原理" },
  { k: /量子もつれ|エンタングルメント/, t: "量子もつれ", b: "2つ以上の粒子の状態が、個別には書けない相関を持つこと。離れていても測定結果に強い相関が現れるが、これで情報を光速より速く送ることはできない。ベルの不等式の破れで実験的に確認されている。", wiki: "量子もつれ" },
  { k: /標準模型|素粒子の標準/, t: "素粒子の標準模型", b: "物質粒子: クォーク6種（u,d,c,s,t,b）とレプトン6種（e,μ,τと3種のニュートリノ）。力を伝える粒子: 光子、W/Zボソン、グルーオン。質量を与えるヒッグス粒子（2012年発見）。重力は含まない。", wiki: "標準模型" },
  { k: /ヒッグス/, t: "ヒッグス粒子", b: "ヒッグス場の励起として現れる素粒子。他の素粒子が質量を持つ仕組みに関わる。2012年にCERNのLHC（ATLAS・CMS実験）で発見が発表された。質量は約125 GeV/c²。", wiki: "ヒッグス粒子" },
  { k: /ブラックホール|シュヴァルツシルト半径|シュワルツシルト/, t: "ブラックホールとシュヴァルツシルト半径", b: "質量 M の天体を半径 r_s = 2GM/c² 以内に押し込むと、事象の地平線ができて光も脱出できない。太陽質量（1.989×10³⁰ kg）なら r_s ≈ 2.95 km、地球質量なら約 8.9 mm。", wiki: "ブラックホール" },
  { k: /ビッグバン/, t: "ビッグバン宇宙論", b: "宇宙は高温高密度の状態から膨張して現在に至ったとするモデル。観測的な根拠: 宇宙の膨張（ハッブル・ルメートルの法則）、宇宙マイクロ波背景放射（約2.7 K）、軽元素の存在比。宇宙の年齢は約138億年と見積もられている。", wiki: "ビッグバン" },
  { k: /ケプラーの(第?[123一二三]?法則|法則)/, t: "ケプラーの法則", b: "第1法則: 惑星は太陽を1つの焦点とする楕円軌道を描く。\n第2法則: 惑星と太陽を結ぶ線分が単位時間に掃く面積は一定（面積速度一定）。\n第3法則: 公転周期の2乗は軌道長半径の3乗に比例（T² ∝ a³。太陽系では T[年]² = a[AU]³）。", wiki: "ケプラーの法則" },
  { k: /ドップラー効果/, t: "ドップラー効果", b: "波源と観測者が相対的に動くと、観測される振動数が変わる。音（観測者静止・音源が速さ v_s で近づく）: f' = f·V/(V − v_s)（V は音速）。光では赤方偏移・青方偏移として現れる。", wiki: "ドップラー効果" },
  { k: /超伝導/, t: "超伝導", b: "ある臨界温度以下で電気抵抗がゼロになり、内部から磁場を排除する（マイスナー効果）現象。低温超伝導の説明はBCS理論（電子がフォノンを介してクーパー対を作る）。1911年、カメルリング・オネスが水銀で発見。", wiki: "超伝導" },
  { k: /核分裂|核融合/, t: "核分裂と核融合", b: "核分裂: 重い原子核（ウラン235など）が分裂してエネルギーを放出。核融合: 軽い原子核（水素の同位体など）が合体してエネルギーを放出（太陽のエネルギー源）。どちらも質量欠損 Δm が E = Δm·c² のエネルギーになる。鉄56付近が結合エネルギー最大。", wiki: "核反応" },
  { k: /放射性崩壊|放射能|放射線/, t: "放射性崩壊", b: "不安定な原子核が放射線（α線・β線・γ線）を出して別の核に変わる現象。崩壊の確率は一定で、残る数は N = N₀·(1/2)^(t/T½)（T½ は半減期）。", wiki: "放射性崩壊" },
  { k: /ピタゴラスの定理|三平方の定理/, t: "ピタゴラスの定理（三平方の定理）", b: "直角三角形の斜辺を c、他の2辺を a, b とすると a² + b² = c²。例: 3, 4, 5。", wiki: "ピタゴラスの定理" },
  { k: /オイラーの公式|オイラーの等式/, t: "オイラーの公式", b: "e^(iθ) = cos θ + i sin θ。θ = π を入れると e^(iπ) + 1 = 0（オイラーの等式）。", wiki: "オイラーの公式" },
  { k: /微分積分学の基本定理/, t: "微積分学の基本定理", b: "連続関数 f の原始関数を F とすると ∫ₐᵇ f(x)dx = F(b) − F(a)。また d/dx ∫ₐˣ f(t)dt = f(x)。微分と積分は逆の操作。", wiki: "微分積分学の基本定理" },
  { k: /テイラー展開|マクローリン/, t: "テイラー展開", b: "f(x) = Σ f⁽ⁿ⁾(a)/n! · (x−a)ⁿ。a = 0 のときがマクローリン展開。例: eˣ = 1 + x + x²/2! + x³/3! + …、sin x = x − x³/3! + x⁵/5! − …", wiki: "テイラーの定理" },
  { k: /正規分布|ガウス分布/, t: "正規分布", b: "確率密度 f(x) = (1/√(2πσ²))·exp(−(x−μ)²/(2σ²))。平均 μ、標準偏差 σ。μ±1σ に約68.3%、±2σ に約95.4%、±3σ に約99.7%が入る。", wiki: "正規分布" },
  { k: /中心極限定理/, t: "中心極限定理", b: "独立で同じ分布に従う確率変数（平均 μ、分散 σ²）の標本平均は、標本数 n が大きいとき、元の分布によらず正規分布 N(μ, σ²/n) に近づく。", wiki: "中心極限定理" },
  { k: /ベイズの定理|ベイズ/, t: "ベイズの定理", b: "P(A|B) = P(B|A)·P(A) / P(B)。事前確率 P(A) を、データ B を見て事後確率 P(A|B) に更新する。", wiki: "ベイズの定理" },
  { k: /大数の(法則|強法則|弱法則)/, t: "大数の法則", b: "試行回数が増えるほど、標本平均は真の平均（期待値）に近づく。", wiki: "大数の法則" },
  { k: /相関係数/, t: "ピアソンの相関係数", b: "r = Σ(xᵢ−x̄)(yᵢ−ȳ) / √(Σ(xᵢ−x̄)²·Σ(yᵢ−ȳ)²)。−1〜1 の値で直線的な関係の強さを表す。相関は因果関係を意味しない。", wiki: "相関係数" },
  { k: /(^|[^a-z])ph(の|とは|は|値)|水素イオン指数/i, t: "pH", b: "pH = −log₁₀[H⁺]（[H⁺] は水素イオン濃度 mol/L）。25 ℃の水は pH 7（中性）。7 より小さいと酸性、大きいとアルカリ性。", wiki: "水素イオン指数" },
  { k: /ルシャトリエ|化学平衡/, t: "ルシャトリエの原理", b: "平衡状態にある系に濃度・圧力・温度などの変化を加えると、その変化を打ち消す向きに平衡が移動する。", wiki: "ル・シャトリエの原理" },
  { k: /ギブズ(の)?(自由)?エネルギー|ギブスの/, t: "ギブズ自由エネルギー", b: "ΔG = ΔH − TΔS。一定温度・一定圧力で ΔG < 0 なら反応は自発的に進む。", wiki: "ギブズエネルギー" },
  { k: /アレニウス/, t: "アレニウスの式", b: "反応速度定数 k = A·exp(−Eₐ/RT)。Eₐ は活性化エネルギー、R = 8.314 J/(mol·K)、T は絶対温度。温度が上がると k は指数的に増える。", wiki: "アレニウスの式" },
  { k: /ネルンスト/, t: "ネルンストの式", b: "電極電位 E = E° − (RT/nF)·ln Q。25 ℃では E = E° − (0.0592/n)·log₁₀ Q（F = 96485 C/mol）。", wiki: "ネルンストの式" },
  { k: /アボガドロの法則/, t: "アボガドロの法則", b: "同温・同圧のもとでは、気体の種類によらず同じ体積に同じ数の分子が含まれる。標準状態（0 ℃, 1 atm）の理想気体1 molの体積は約22.4 L。", wiki: "アボガドロの法則" },
  { k: /光合成/, t: "光合成の反応式", b: "6CO₂ + 6H₂O + 光エネルギー → C₆H₁₂O₆ + 6O₂。光化学反応（チラコイド膜で ATP・NADPH を作り O₂ を放出）と、カルビン・ベンソン回路（CO₂を固定して糖を作る）からなる。", wiki: "光合成" },
  { k: /セントラルドグマ/, t: "セントラルドグマ", b: "遺伝情報の基本的な流れ: DNA →(転写)→ RNA →(翻訳)→ タンパク質。（逆転写酵素により RNA → DNA の流れもある）", wiki: "セントラルドグマ" },
  { k: /dna.*(二重らせん|構造)|二重らせん/i, t: "DNAの二重らせん構造", b: "ワトソンとクリックが1953年に提唱。2本の逆向きのヌクレオチド鎖が塩基対（A–T, G–C）で結びついたらせん構造。", wiki: "DNA" },
  { k: /メンデルの(遺伝)?(法則|三法則)|優性の法則|分離の法則|独立の法則/, t: "メンデルの法則", b: "優性の法則: 異なる形質の親の雑種第1代には優性の形質だけが現れる。\n分離の法則: 配偶子形成のとき対立遺伝子は分かれる（雑種第2代で 優性:劣性 = 3:1）。\n独立の法則: 異なる遺伝子の組は独立に遺伝する（連鎖がない場合）。", wiki: "メンデルの法則" },
  { k: /自然選択|自然淘汰|進化論/, t: "自然選択説（ダーウィン）", b: "(1) 個体には変異がある (2) 変異の一部は遺伝する (3) 生存・繁殖の成功率に差がある → 有利な形質が世代を経て集団に広まる。1859年『種の起源』。", wiki: "自然選択説" },
  { k: /crispr|クリスパー|ゲノム編集/i, t: "CRISPR-Cas9", b: "細菌の獲得免疫を応用したゲノム編集技術。ガイドRNAで標的のDNA配列を指定し、Cas9酵素がその位置を切断する。切断の修復を利用して遺伝子を破壊・置換する。2020年ノーベル化学賞（シャルパンティエ、ダウドナ）。", wiki: "CRISPR" },
  { k: /チューリングマシン/, t: "チューリングマシン", b: "無限の長さのテープ、読み書きヘッド、有限個の状態と遷移規則からなる計算の数理モデル（アラン・チューリング, 1936）。計算可能性の理論の基礎で、停止性問題は決定不能であることが示されている。", wiki: "チューリングマシン" },
  { k: /np完全|p\s*対\s*np|p≠np|p=np/i, t: "P と NP", b: "P: 多項式時間で解ける問題の集合。NP: 解の正しさを多項式時間で検証できる問題の集合。P ⊆ NP は明らかだが、P = NP かどうかは未解決（クレイ数学研究所のミレニアム懸賞問題の1つ）。NP完全: NPの中で最も難しい問題群。", wiki: "P≠NP予想" },
  { k: /ビッグ?オー|計算量|o\(n/i, t: "計算量とビッグオー記法", b: "入力サイズ n に対して手間がどう増えるかを表す。O(1) 一定 < O(log n) 二分探索 < O(n) 線形探索 < O(n log n) 良い整列 < O(n²) 単純な整列 < O(2ⁿ) 指数時間。", wiki: "ランダウの記号" },
];
function concept(text) {
  const t = zen2han(text); if (t.length > 40) return null;
  const e = KB.find(x => x.k.test(t));
  return e ? { text: `【${e.t}】\n${e.b}`, wiki: e.wiki } : null;
}

function answer(text) {
  const t = String(text).trim(); if (!t) return null;
  for (const fn of [physics, calculus, quadratic, comb, stats, concept]) { const r = fn(t); if (r) return r; }
  return null;
}
const api = { answer, physics, calculus, quadratic, stats, comb, concept, KB, qtys };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Science = api;
})(typeof window !== "undefined" ? window : globalThis);
