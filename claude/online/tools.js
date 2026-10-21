/* 通信なしで正確に答えられる「道具」と「知識」。
 * ブラウザ(window.Tools)でも Node(module.exports)でも動く。
 * Tools.answer(text, now) → Promise<{text, refs?:string[]} | null>
 */
(function (root) {
"use strict";

// ---------- 共通ユーティリティ ----------
const pad = n => String(n).padStart(2, "0");
const WD = "日月火水木金土";
const zen2han = s => s.replace(/[０-９．，－＋＊／（）％]/g, c => ({ "．": ".", "，": ",", "－": "-", "＋": "+", "＊": "*", "／": "/", "（": "(", "）": ")", "％": "%" }[c] || String.fromCharCode(c.charCodeAt(0) - 0xFEE0)));
const fmt = n => {
  if (!isFinite(n)) return String(n);
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1e15 || a < 1e-6) return n.toExponential(6).replace(/\.?0+e/, "e");
  return Number(n.toPrecision(10)).toLocaleString("ja-JP", { maximumFractionDigits: 10, useGrouping: a >= 10000 });
};
const dayNum = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 86400000);
const fromDayNum = n => { const t = new Date(n * 86400000); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const dstr = (y, m, d) => `${y}年${m}月${d}日(${WD[dow(y, m, d)]})`;
const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const todayOf = now => [now.getFullYear(), now.getMonth() + 1, now.getDate()];
const MDN = p => "https://developer.mozilla.org/en-US/docs/Web/" + p;
const PY = p => "https://docs.python.org/ja/3/" + p + ".html";
const GIT = n => "https://git-scm.com/docs/git-" + n;

// ---------- 電卓（eval 不使用） ----------
const FUNCS = { sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log10: Math.log10, log2: Math.log2, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, exp: Math.exp };
function calc(src) {
  const s = zen2han(src).replace(/[×x＊]/g, "*").replace(/[÷]/g, "/").replace(/[ー−]/g, "-").replace(/π/g, "pi").replace(/√/g, "sqrt").replace(/\s+/g, "").toLowerCase();
  if (!/^[0-9a-z.+\-*/^%(),]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i];
  function expr() { let v = term(); while (peek() === "+" || peek() === "-") { const o = s[i++]; const r = term(); v = o === "+" ? v + r : v - r; } return v; }
  function term() { let v = unary(); while (peek() === "*" || peek() === "/" || peek() === "%") { const o = s[i++]; const r = unary(); v = o === "*" ? v * r : o === "/" ? v / r : v % r; } return v; }
  function unary() { if (peek() === "-") { i++; return -unary(); } if (peek() === "+") { i++; return unary(); } return power(); }
  function power() { const b = atom(); if (peek() === "^") { i++; return Math.pow(b, unary()); } return b; }
  function atom() {
    if (peek() === "(") { i++; const v = expr(); if (s[i++] !== ")") throw 0; return v; }
    let m = /^[0-9]+(\.[0-9]+)?(e[+-]?[0-9]+)?/.exec(s.slice(i));
    if (m && !/^[0-9]+e[a-z]/.test(s.slice(i))) { i += m[0].length; return parseFloat(m[0]); }
    m = /^[a-z0-9]+/.exec(s.slice(i)); if (!m) throw 0;
    const name = m[0];
    if (name === "pi") { i += 2; return Math.PI; }
    if (name === "e" ) { i += 1; return Math.E; }
    const fm = /^(sqrt|abs|ln|log10|log2|sin|cos|tan|floor|ceil|round|exp)/.exec(s.slice(i));
    if (fm && s[i + fm[0].length] === "(") { i += fm[0].length + 1; const v = expr(); if (s[i++] !== ")") throw 0; return FUNCS[fm[0]](v); }
    throw 0;
  }
  try { const v = expr(); return i === s.length && isFinite(v) ? v : null; } catch (e) { return null; }
}
function calcAnswer(t) {
  const e = t.replace(/(は|を|って|＝|=|？|\?|計算してください|計算して|計算|いくつ|答え|ですか|になる|[。、])/g, "");
  if (!/[0-9０-９]|pi|π/.test(e)) return null;
  if (!/[+\-*/^%×÷＋－＊／()（）x√]|sqrt|abs|ln|log|sin|cos|tan/.test(e) ) return null;
  const v = calc(e);
  if (v === null) return null;
  return { text: `${e.replace(/\s+/g, "")} = ${fmt(Math.round(v * 1e12) / 1e12)}` };
}

// ---------- 単位変換 ----------
// [別名(小文字), カテゴリ, 基準単位への倍率, 表示名]
const U = [];
const addU = (cat, name, factor, aliases) => aliases.forEach(a => U.push([a.toLowerCase(), cat, factor, name]));
addU("長さ", "メートル(m)", 1, ["メートル", "m", "ｍ"]);
addU("長さ", "キロメートル(km)", 1000, ["キロメートル", "km", "ｋｍ", "キロ"]);
addU("長さ", "センチメートル(cm)", 0.01, ["センチメートル", "センチ", "cm"]);
addU("長さ", "ミリメートル(mm)", 0.001, ["ミリメートル", "ミリ", "mm"]);
addU("長さ", "マイル(mile)", 1609.344, ["マイル", "miles", "mile", "mi"]);
addU("長さ", "ヤード(yd)", 0.9144, ["ヤード", "yards", "yard", "yd"]);
addU("長さ", "フィート(ft)", 0.3048, ["フィート", "feet", "foot", "ft"]);
addU("長さ", "インチ(inch)", 0.0254, ["インチ", "inches", "inch"]);
addU("長さ", "海里", 1852, ["海里"]);
addU("長さ", "尺", 10 / 33, ["尺"]);
addU("重さ", "キログラム(kg)", 1, ["キログラム", "kg", "ｋｇ", "キロ"]);
addU("重さ", "グラム(g)", 0.001, ["グラム", "g"]);
addU("重さ", "ミリグラム(mg)", 1e-6, ["ミリグラム", "mg"]);
addU("重さ", "トン(t)", 1000, ["トン", "t"]);
addU("重さ", "ポンド(lb)", 0.45359237, ["ポンド", "lbs", "lb"]);
addU("重さ", "オンス(oz)", 0.028349523125, ["オンス", "oz"]);
addU("重さ", "貫", 3.75, ["貫"]);
addU("重さ", "匁", 0.00375, ["匁", "もんめ"]);
addU("体積", "リットル(L)", 1, ["リットル", "l"]);
addU("体積", "ミリリットル(mL)", 0.001, ["ミリリットル", "ml"]);
addU("体積", "立方メートル(m³)", 1000, ["立方メートル", "m3", "m³", "㎥"]);
addU("体積", "ガロン(米)", 3.785411784, ["ガロン", "gallons", "gallon", "gal"]);
addU("体積", "カップ(日本の計量カップ200mL)", 0.2, ["カップ"]);
addU("体積", "米カップ(約236.6mL)", 0.2365882365, ["米カップ", "usカップ"]);
addU("体積", "大さじ(15mL)", 0.015, ["大さじ"]);
addU("体積", "小さじ(5mL)", 0.005, ["小さじ"]);
addU("体積", "合(尺貫法)", 0.18039, ["合"]);
addU("体積", "升(尺貫法)", 1.8039, ["升"]);
addU("面積", "平方メートル(m²)", 1, ["平方メートル", "m2", "m²", "㎡"]);
addU("面積", "平方キロメートル(km²)", 1e6, ["平方キロメートル", "km2", "km²", "㎢"]);
addU("面積", "ヘクタール(ha)", 10000, ["ヘクタール", "ha"]);
addU("面積", "エーカー", 4046.8564224, ["エーカー", "acres", "acre"]);
addU("面積", "坪", 400 / 121, ["坪"]);
addU("速度", "m/s", 1, ["m/s", "メートル毎秒"]);
addU("速度", "km/h", 1 / 3.6, ["km/h", "kmh", "時速"]);
addU("速度", "mph", 0.44704, ["mph", "マイル毎時"]);
addU("速度", "ノット", 1852 / 3600, ["ノット", "knots", "knot", "kt"]);
addU("時間", "秒", 1, ["秒", "seconds", "second", "sec"]);
addU("時間", "分", 60, ["分", "minutes", "minute", "min"]);
addU("時間", "時間", 3600, ["時間", "hours", "hour", "hr"]);
addU("時間", "日", 86400, ["日", "days", "day"]);
addU("時間", "週間", 604800, ["週間", "weeks", "week"]);
addU("データ量", "バイト(B)", 1, ["バイト", "bytes", "byte"]);
addU("データ量", "KB(1000B)", 1e3, ["kb", "キロバイト"]);
addU("データ量", "MB(1000²B)", 1e6, ["mb", "メガバイト"]);
addU("データ量", "GB(1000³B)", 1e9, ["gb", "ギガバイト"]);
addU("データ量", "TB(1000⁴B)", 1e12, ["tb", "テラバイト"]);
addU("データ量", "KiB(1024B)", 1024, ["kib"]);
addU("データ量", "MiB(1024²B)", 1048576, ["mib"]);
addU("データ量", "GiB(1024³B)", 1073741824, ["gib"]);
addU("データ量", "TiB(1024⁴B)", 1099511627776, ["tib"]);
// 温度は別扱い
const TEMP = [["℃", "摂氏(℃)"], ["°c", "摂氏(℃)"], ["度c", "摂氏(℃)"], ["摂氏", "摂氏(℃)"], ["セルシウス", "摂氏(℃)"], ["c", "摂氏(℃)"],
  ["℉", "華氏(℉)"], ["°f", "華氏(℉)"], ["度f", "華氏(℉)"], ["華氏", "華氏(℉)"], ["f", "華氏(℉)"],
  ["ケルビン", "ケルビン(K)"], ["kelvin", "ケルビン(K)"]];
const toC = (v, u) => u === "摂氏(℃)" ? v : u === "華氏(℉)" ? (v - 32) * 5 / 9 : v - 273.15;
const fromC = (c, u) => u === "摂氏(℃)" ? c : u === "華氏(℉)" ? c * 9 / 5 + 32 : c + 273.15;
const isLatin = ch => /[a-z0-9]/i.test(ch || "");
function matchAt(str, pos, table, rawIdx) {   // pos から始まる最長の別名
  let best = null;
  for (const row of table) {
    const a = row[0];
    if (str.startsWith(a, pos) && (!best || a.length > best[0].length)) {
      if (/^[a-z]/.test(a) && isLatin(str[pos + a.length])) continue;     // 英字の別名は単語の途中で切らない
      if (/^[a-z]/.test(a) && pos > 0 && isLatin(str[pos - 1]) && rawIdx !== "src") continue;
      best = row;
    }
  }
  return best;
}
function convertUnits(text) {
  const s = zen2han(text).toLowerCase();
  const nm = /(-?\d[\d,]*(?:\.\d+)?)\s*/.exec(s);
  if (!nm) return null;
  const val = parseFloat(nm[1].replace(/,/g, ""));
  const pos0 = nm.index + nm[0].length;
  const rest = s.slice(pos0);
  // 温度
  const tSrc = matchAt(rest, 0, TEMP, "src");
  if (tSrc) {
    for (let k = tSrc[0].length; k < rest.length; k++) {
      const tt = matchAt(rest, k, TEMP, "tgt");
      if (tt && tt[1] !== tSrc[1]) { const c = toC(val, tSrc[1]); const r = fromC(c, tt[1]); return { text: `${fmt(val)} ${tSrc[1]} = ${fmt(Math.round(r * 1e8) / 1e8)} ${tt[1]}` }; }
    }
    return null;
  }
  const first = matchAt(rest, 0, U, "src");
  if (!first) return null;
  for (const src of U.filter(r => r[0] === first[0])) {         // 「キロ」のように複数の単位に当たる別名は全部試す
    const cands = U.filter(r => r[1] === src[1]);
    for (let k = src[0].length; k < rest.length; k++) {
      const tgt = matchAt(rest, k, cands, "tgt");
      if (tgt && tgt[3] !== src[3]) {
        const r = val * src[2] / tgt[2];
        const note = src[1] === "データ量" ? "（KB/MB…は1000換算、KiB/MiB…は1024換算）" : "";
        return { text: `${fmt(val)} ${src[3]} = ${fmt(r)} ${tgt[3]}${note}` };
      }
    }
  }
  return null;
}

// ---------- 日付・暦 ----------
const ERAS = [["明治", 1868], ["大正", 1912], ["昭和", 1926], ["平成", 1989], ["令和", 2019]];
const ERA_SWITCH = { 1912: "7月30日", 1926: "12月25日", 1989: "1月8日", 2019: "5月1日" };   // 新元号の開始日
const STEMS = "甲乙丙丁戊己庚辛壬癸", BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const eto = y => STEMS[((y - 4) % 10 + 10) % 10] + BRANCHES[((y - 4) % 12 + 12) % 12];
const ANIMAL = { 子: "ねずみ", 丑: "うし", 寅: "とら", 卯: "うさぎ", 辰: "たつ", 巳: "へび", 午: "うま", 未: "ひつじ", 申: "さる", 酉: "とり", 戌: "いぬ", 亥: "いのしし" };
const eraOf = y => {
  const out = [];
  for (let i = ERAS.length - 1; i >= 0; i--) if (y >= ERAS[i][1]) { out.push([ERAS[i][0], y - ERAS[i][1] + 1]); if (ERA_SWITCH[y] === undefined) break; else if (out.length === 2) break; }
  return out;
};
const eraName = ([n, k]) => `${n}${k === 1 ? "元" : k}年`;
function parseDate(t, now) {
  let m = /(\d{4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})\s*日?/.exec(t);
  if (m) return { ymd: [+m[1], +m[2], +m[3]], idx: m.index, len: m[0].length };
  const rel = /(一昨日|おととい|昨日|きのう|今日|きょう|本日|明日|あした|明後日|あさって)/.exec(t);
  if (rel) { const off = { 一昨日: -2, おととい: -2, 昨日: -1, きのう: -1, 今日: 0, きょう: 0, 本日: 0, 明日: 1, あした: 1, 明後日: 2, あさって: 2 }[rel[1]]; return { ymd: fromDayNum(dayNum(...todayOf(now)) + off), idx: rel.index, len: rel[0].length }; }
  return null;
}
function validYMD([y, m, d]) { return m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m); }
function addMonths([y, m, d], k) { let t = y * 12 + (m - 1) + k; const ny = Math.floor(t / 12), nm = t % 12 + 1; return [ny, nm, Math.min(d, daysIn(ny, nm))]; }

function dateAnswer(t0, now) {
  const t = zen2han(t0);
  // 和暦 → 西暦
  let m = /(明治|大正|昭和|平成|令和)\s*(元|\d+)\s*年/.exec(t);
  if (m) {
    const era = ERAS.find(e => e[0] === m[1]); const k = m[2] === "元" ? 1 : +m[2];
    const y = era[1] + k - 1;
    const idx = ERAS.indexOf(era), next = ERAS[idx + 1];
    if (k < 1 || (next && y > next[1])) return { text: `${m[1]}${k}年は存在しません。` };
    return { text: `${m[1]}${m[2] === "元" ? "元" : k}年は西暦${y}年です。` + (next && y === next[1] ? `（この年は${next[0]}元年の${ERA_SWITCH[y]}以降も含みます）` : "") };
  }
  // 西暦 → 和暦 / 干支 / うるう年
  m = /(\d{4})\s*年(?!\s*\d+\s*月)/.exec(t);
  if (m && /(和暦|元号|令和|平成|昭和|大正|明治|何年)/.test(t) && !/(干支|うるう|閏)/.test(t)) {
    const y = +m[1];
    if (y < 1868) return { text: "明治より前は、このツールの対象外です。" };
    const e = eraOf(y);
    return { text: e.length === 2 ? `${y}年は ${eraName(e[1])}（${ERA_SWITCH[y]}以降は${eraName(e[0])}）です。` : `${y}年は${eraName(e[0])}です。` };
  }
  if (m && /干支/.test(t)) { const y = +m[1], e = eto(y); return { text: `${y}年は ${e}(${e[0]}${e[1]}) の年で、十二支は「${e[1]}」（${ANIMAL[e[1]]}年）です。` }; }
  if (m && /(うるう|閏)/.test(t)) { const y = +m[1]; return { text: `${y}年は${isLeap(y) ? "うるう年です（2月は29日まで）" : "うるう年ではありません（2月は28日まで）"}。` }; }

  // 生まれ → 年齢
  m = /(\d{4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})\s*日?\s*(生まれ|うまれ)/.exec(t);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]]; const [ty, tm, td] = todayOf(now);
    let age = ty - y; if (tm < mo || (tm === mo && td < d)) age--;
    return { text: `${dstr(y, mo, d)}生まれの人は、${dstr(ty, tm, td)}時点で ${age}歳 です。` };
  }

  // 2つの日付の間
  const all = [...t.matchAll(/(\d{4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})\s*日?/g)];
  if (all.length >= 2 && /(何日|日数|間)/.test(t)) {
    const a = all[0].slice(1, 4).map(Number), b = all[1].slice(1, 4).map(Number);
    if (!validYMD(a) || !validYMD(b)) return { text: "存在しない日付が含まれています。" };
    const diff = dayNum(...b) - dayNum(...a);
    return { text: `${dstr(...a)} から ${dstr(...b)} まで ${Math.abs(diff)}日（${Math.abs(diff) / 7 | 0}週と${Math.abs(diff) % 7}日）です。` };
  }

  // 曜日 / 経過日数 / N日後
  const pd = parseDate(t, now);
  const add = /(\d+)\s*(日|週間|ヶ月|か月|カ月|ヵ月|年)\s*(後|前|あと|まえ)/.exec(t);
  if (add && (pd || /(今日から|から)/.test(t) || true) && !/生まれ/.test(t)) {
    const base = pd ? pd.ymd : todayOf(now), k = +add[1], sign = /後|あと/.test(add[3]) ? 1 : -1;
    if (!validYMD(base)) return { text: "存在しない日付です。" };
    let res;
    if (add[2] === "日") res = fromDayNum(dayNum(...base) + sign * k);
    else if (add[2] === "週間") res = fromDayNum(dayNum(...base) + sign * k * 7);
    else if (add[2] === "年") res = addMonths(base, sign * k * 12);
    else res = addMonths(base, sign * k);
    return { text: `${dstr(...base)} の ${k}${add[2]}${sign > 0 ? "後" : "前"} は ${dstr(...res)} です。` };
  }
  if (pd) {
    if (!validYMD(pd.ymd)) return { text: `${pd.ymd.join("/")} は存在しない日付です。` };
    if (/曜日/.test(t)) return { text: `${dstr(...pd.ymd)} です。` };
    if (/(まで|あと|何日|経過|過ぎ)/.test(t)) {
      const diff = dayNum(...pd.ymd) - dayNum(...todayOf(now));
      const tdy = dstr(...todayOf(now));
      return { text: diff === 0 ? `${dstr(...pd.ymd)} は今日です。` : diff > 0 ? `今日(${tdy})から ${dstr(...pd.ymd)} まで、あと ${diff}日（${diff / 7 | 0}週と${diff % 7}日）です。` : `${dstr(...pd.ymd)} から今日(${tdy})まで、${-diff}日 経過しています。` };
    }
  }
  return null;
}

// ---------- 数学 ----------
function factorize(n) {
  const out = []; let x = n;
  for (let p = 2; p * p <= x; p += p === 2 ? 1 : 2) while (x % p === 0) { out.push(p); x /= p; }
  if (x > 1) out.push(x);
  return out;
}
const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
function mathAnswer(t0) {
  const t = zen2han(t0).replace(/,/g, "");
  let m;
  if ((m = /(\d+)\s*(?:を|の)?\s*素因数分解/.exec(t))) {
    const n = +m[1];
    if (n < 2 || n > 1e12) return { text: "2以上 1兆以下の整数で試してください。" };
    const f = factorize(n), cnt = {}; f.forEach(p => cnt[p] = (cnt[p] || 0) + 1);
    return { text: `${n} = ${Object.entries(cnt).map(([p, c]) => c > 1 ? `${p}^${c}` : p).join(" × ")}${f.length === 1 ? "（素数です）" : ""}` };
  }
  if ((m = /(\d+)\s*(?:は|って)?\s*素数/.exec(t))) {
    const n = +m[1]; if (n > 1e12) return { text: "1兆以下で試してください。" };
    const isP = n >= 2 && factorize(n).length === 1;
    return { text: `${n} は素数${isP ? "です" : "ではありません" + (n >= 2 ? `（${factorize(n).join(" × ")}）` : "")}。` };
  }
  if (/(最大公約数|最小公倍数)/.test(t)) {
    const nums = (t.match(/\d+/g) || []).map(Number);
    if (nums.length >= 2 && nums.every(n => n > 0 && n < 1e12)) {
      const g = nums.reduce(gcd); const l = nums.reduce((a, b) => a / gcd(a, b) * b);
      const wantG = /最大公約数/.test(t), wantL = /最小公倍数/.test(t);
      return { text: `${nums.join("、")} の` + (wantG ? `最大公約数は ${g}` : "") + (wantG && wantL ? "、" : "") + (wantL ? `最小公倍数は ${l}` : "") + " です。" };
    }
  }
  if ((m = /(\d+)\s*(?:の階乗|!)/.exec(t))) {
    const n = +m[1]; if (n > 170) return { text: "170以下で試してください。" };
    let r = 1n; for (let i = 2n; i <= BigInt(n); i++) r *= i;
    return { text: `${n}! = ${r.toString()}` };
  }
  if ((m = /フィボナッチ.*?(\d+)\s*(?:番目|項)/.exec(t))) {
    const n = +m[1]; if (n < 1 || n > 1000) return { text: "1〜1000番目で試してください。" };
    let a = 0n, b = 1n; for (let i = 1; i < n; i++) [a, b] = [b, a + b];
    return { text: `フィボナッチ数列の${n}番目は ${(n === 1 ? 1n : b).toString()} です（1, 1, 2, 3, 5, …）。` };
  }
  if ((m = /(\d+(?:\.\d+)?)\s*円?\s*の\s*(\d+(?:\.\d+)?)\s*%\s*(オフ|引き|off|割引)/i.exec(t))) {
    const p = +m[1], r = +m[2]; return { text: `${fmt(p)}円の${r}%${m[3]}は ${fmt(p * (1 - r / 100))}円（${fmt(p * r / 100)}円引き）です。` };
  }
  if ((m = /(\d+(?:\.\d+)?)\s*の\s*(\d+(?:\.\d+)?)\s*%/.exec(t))) return { text: `${fmt(+m[1])} の ${m[2]}% は ${fmt(+m[1] * +m[2] / 100)} です。` };
  if ((m = /(\d+(?:\.\d+)?)\s*は\s*(\d+(?:\.\d+)?)\s*の\s*何\s*%/.exec(t))) return { text: `${fmt(+m[1])} は ${fmt(+m[2])} の ${fmt(+m[1] / +m[2] * 100)}% です。` };
  if ((m = /身長\s*(\d+(?:\.\d+)?)\s*(?:cm|センチ)?.*?体重\s*(\d+(?:\.\d+)?)/i.exec(t)) && /(bmi|BMI|肥満|ＢＭＩ)/i.test(t)) {
    const h = +m[1] / (+m[1] > 3 ? 100 : 1), w = +m[2], b = w / (h * h);
    const c = b < 18.5 ? "低体重" : b < 25 ? "普通体重" : b < 30 ? "肥満(1度)" : b < 35 ? "肥満(2度)" : b < 40 ? "肥満(3度)" : "肥満(4度)";
    return { text: `BMI = ${w} ÷ (${h}×${h}) = ${b.toFixed(1)}（日本肥満学会の基準で「${c}」）。あくまで目安です。` };
  }
  // 進数変換
  const baseNames = { 2: "2進数", 8: "8進数", 10: "10進数", 16: "16進数" };
  if (!/rgb\s*\(/i.test(t) && (m = /(0x[0-9a-f]+|0b[01]+|0o[0-7]+|[0-9a-f]+)\s*(?:を|は)?\s*(?:\(?(\d+)進(?:数)?\)?\s*(?:から|の|で)?\s*)?(\d+)\s*進数?\s*(?:に|で|へ)/i.exec(t)) && /進/.test(t)) {
    let s = m[1].toLowerCase(), from = m[2] ? +m[2] : 10;
    if (s.startsWith("0x")) { from = 16; s = s.slice(2); } else if (s.startsWith("0b")) { from = 2; s = s.slice(2); } else if (s.startsWith("0o")) { from = 8; s = s.slice(2); }
    const to = +m[3];
    if (from >= 2 && from <= 36 && to >= 2 && to <= 36) {
      const digits = "0123456789abcdefghijklmnopqrstuvwxyz"; let n = 0n;
      for (const ch of s) { const d = digits.indexOf(ch); if (d < 0 || d >= from) return { text: `「${s}」は${from}進数として正しくありません。` }; n = n * BigInt(from) + BigInt(d); }
      return { text: `${s}(${from}進数) = ${n.toString(to).toUpperCase()}(${to}進数)${to === 10 ? "" : ""}` };
    }
  }
  return null;
}

// ---------- 文字列・暗号・乱数 ----------
function quoted(t) { const m = /[「『“"]([\s\S]+?)[」』”"]/.exec(t) || /[:：]\s*([\s\S]+)$/.exec(t); return m ? m[1] : null; }
const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const b64enc = s => { const by = new TextEncoder().encode(s); let bin = ""; by.forEach(b => bin += String.fromCharCode(b)); return btoa(bin); };
const b64dec = s => { const bin = atob(s.trim()); return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0))); };
function rand(n) {                       // 0..n-1 の偏りのない乱数
  const lim = Math.floor(0x100000000 / n) * n; const a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= lim);
  return a[0] % n;
}
async function textAnswer(t0, now) {
  const t = t0.trim(); let m;
  if (/(文字数|何文字|カウント)/.test(t) && quoted(t) !== null) {
    const q = quoted(t); const chars = Array.from(q);
    return { text: `文字数: ${chars.length}文字（UTF-8で ${new TextEncoder().encode(q).length}バイト、${q.split("\n").length}行）` };
  }
  if (/base64/i.test(t) && quoted(t) !== null) {
    const q = quoted(t);
    if (/(デコード|復号|decode)/i.test(t)) { try { return { text: `デコード結果: ${b64dec(q)}` }; } catch (e) { return { text: "Base64として正しくないか、UTF-8の文字列ではありません。" }; } }
    return { text: `Base64: ${b64enc(q)}` };
  }
  if (/(URL|ＵＲＬ|url)\s*(エンコード|デコード|encode|decode)/i.test(t) && quoted(t) !== null) {
    const q = quoted(t);
    if (/(デコード|decode)/i.test(t)) { try { return { text: `デコード結果: ${decodeURIComponent(q)}` }; } catch (e) { return { text: "URLエンコードとして正しくありません。" }; } }
    return { text: `エンコード結果: ${encodeURIComponent(q)}` };
  }
  if (/(sha-?256|ハッシュ)/i.test(t) && quoted(t) !== null) {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(quoted(t)));
    return { text: `SHA-256: ${toHex(h)}` };
  }
  if (/uuid/i.test(t)) return { text: `UUID(v4): ${crypto.randomUUID()}` };
  if ((m = /パスワード/.exec(t)) && /(生成|作|考え|出して)/.test(t)) {
    const len = Math.min(64, Math.max(8, +(/(\d+)\s*(?:桁|文字)/.exec(zen2han(t)) || [0, 16])[1]));
    const sets = ["abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0123456789", "!@#$%^&*-_=+"];
    const all = sets.join(""); const out = sets.map(s => s[rand(s.length)]);
    while (out.length < len) out.push(all[rand(all.length)]);
    for (let i = out.length - 1; i > 0; i--) { const j = rand(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return { text: `${out.join("")}\n（${len}文字・大小英字/数字/記号を含む。ブラウザ内で生成し、どこにも送信していません）` };
  }
  if ((m = /(\d+)\s*(?:から|〜|~|-)\s*(\d+)\s*(?:の|まで).*(乱数|ランダム|ランダム)/.exec(zen2han(t)))) {
    const a = +m[1], b = +m[2]; if (b >= a) return { text: `${a + rand(b - a + 1)}（${a}〜${b}の乱数）` };
  }
  if (/(unix|ＵＮＩＸ|エポック)/i.test(t)) {
    const n = /(?:unix|ＵＮＩＸ|エポック)\D*?(\d{1,13})/i.exec(zen2han(t));
    if (n) { let v = +n[1]; if (n[1].length > 11) v = Math.floor(v / 1000); const d = new Date(v * 1000); return { text: `${n[1]} → ${d.toISOString()} (UTC) / ${d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} (日本時間)` }; }
    return { text: `現在のUNIX時間: ${Math.floor(now.getTime() / 1000)}` };
  }
  if ((m = /#?([0-9a-f]{6})\b.*(rgb|ＲＧＢ)/i.exec(t)) || (m = /#([0-9a-f]{6})\b/i.exec(t))) {
    const h = m[1]; const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return { text: `#${h.toLowerCase()} = rgb(${r}, ${g}, ${b})` };
  }
  if ((m = /rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/i.exec(t)) && +m[1] < 256 && +m[2] < 256 && +m[3] < 256)
    return { text: `rgb(${m[1]}, ${m[2]}, ${m[3]}) = #${[m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, "0")).join("")}` };
  return null;
}

// ---------- 世界時計 ----------
const CITIES = { 東京: "Asia/Tokyo", 日本: "Asia/Tokyo", 大阪: "Asia/Tokyo", ソウル: "Asia/Seoul", 北京: "Asia/Shanghai", 上海: "Asia/Shanghai", 香港: "Asia/Hong_Kong", 台北: "Asia/Taipei",
  シンガポール: "Asia/Singapore", バンコク: "Asia/Bangkok", デリー: "Asia/Kolkata", ムンバイ: "Asia/Kolkata", ドバイ: "Asia/Dubai", モスクワ: "Europe/Moscow",
  ロンドン: "Europe/London", パリ: "Europe/Paris", ベルリン: "Europe/Berlin", ローマ: "Europe/Rome", マドリード: "Europe/Madrid", カイロ: "Africa/Cairo",
  ニューヨーク: "America/New_York", シカゴ: "America/Chicago", デンバー: "America/Denver", ロサンゼルス: "America/Los_Angeles", トロント: "America/Toronto",
  サンパウロ: "America/Sao_Paulo", ホノルル: "Pacific/Honolulu", ハワイ: "Pacific/Honolulu", シドニー: "Australia/Sydney", オークランド: "Pacific/Auckland", UTC: "UTC" };
function clockAnswer(t, now) {
  if (!/(時間|時刻|何時|いま|今)/.test(t)) return null;
  const name = Object.keys(CITIES).sort((a, b) => b.length - a.length).find(c => t.includes(c));
  if (!name || (name === "東京" && /天気/.test(t))) return null;
  const tz = CITIES[name];
  const f = new Intl.DateTimeFormat("ja-JP", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const jst = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  return { text: `${name}（${tz}）は ${f.format(now)} です。日本時間は ${jst} です。` };
}

// ---------- 知識データ ----------
const ELEMENTS = ("H 水素,He ヘリウム,Li リチウム,Be ベリリウム,B ホウ素,C 炭素,N 窒素,O 酸素,F フッ素,Ne ネオン,Na ナトリウム,Mg マグネシウム,Al アルミニウム,Si ケイ素,P リン,S 硫黄,Cl 塩素,Ar アルゴン,K カリウム,Ca カルシウム," +
  "Sc スカンジウム,Ti チタン,V バナジウム,Cr クロム,Mn マンガン,Fe 鉄,Co コバルト,Ni ニッケル,Cu 銅,Zn 亜鉛,Ga ガリウム,Ge ゲルマニウム,As ヒ素,Se セレン,Br 臭素,Kr クリプトン,Rb ルビジウム,Sr ストロンチウム,Y イットリウム,Zr ジルコニウム," +
  "Nb ニオブ,Mo モリブデン,Tc テクネチウム,Ru ルテニウム,Rh ロジウム,Pd パラジウム,Ag 銀,Cd カドミウム,In インジウム,Sn スズ,Sb アンチモン,Te テルル,I ヨウ素,Xe キセノン,Cs セシウム,Ba バリウム,La ランタン,Ce セリウム,Pr プラセオジム,Nd ネオジム," +
  "Pm プロメチウム,Sm サマリウム,Eu ユウロピウム,Gd ガドリニウム,Tb テルビウム,Dy ジスプロシウム,Ho ホルミウム,Er エルビウム,Tm ツリウム,Yb イッテルビウム,Lu ルテチウム,Hf ハフニウム,Ta タンタル,W タングステン,Re レニウム,Os オスミウム,Ir イリジウム,Pt 白金,Au 金,Hg 水銀," +
  "Tl タリウム,Pb 鉛,Bi ビスマス,Po ポロニウム,At アスタチン,Rn ラドン,Fr フランシウム,Ra ラジウム,Ac アクチニウム,Th トリウム,Pa プロトアクチニウム,U ウラン,Np ネプツニウム,Pu プルトニウム,Am アメリシウム,Cm キュリウム,Bk バークリウム,Cf カリホルニウム," +
  "Es アインスタイニウム,Fm フェルミウム,Md メンデレビウム,No ノーベリウム,Lr ローレンシウム,Rf ラザホージウム,Db ドブニウム,Sg シーボーギウム,Bh ボーリウム,Hs ハッシウム,Mt マイトネリウム,Ds ダームスタチウム,Rg レントゲニウム,Cn コペルニシウム," +
  "Nh ニホニウム,Fl フレロビウム,Mc モスコビウム,Lv リバモリウム,Ts テネシン,Og オガネソン").split(",").map((s, i) => { const [sym, name] = s.split(" "); return { z: i + 1, sym, name }; });

const PREF = ("北海道,札幌市,北海道;青森県,青森市,東北;岩手県,盛岡市,東北;宮城県,仙台市,東北;秋田県,秋田市,東北;山形県,山形市,東北;福島県,福島市,東北;" +
  "茨城県,水戸市,関東;栃木県,宇都宮市,関東;群馬県,前橋市,関東;埼玉県,さいたま市,関東;千葉県,千葉市,関東;東京都,東京（都庁は新宿区）,関東;神奈川県,横浜市,関東;" +
  "新潟県,新潟市,中部;富山県,富山市,中部;石川県,金沢市,中部;福井県,福井市,中部;山梨県,甲府市,中部;長野県,長野市,中部;岐阜県,岐阜市,中部;静岡県,静岡市,中部;愛知県,名古屋市,中部;" +
  "三重県,津市,近畿;滋賀県,大津市,近畿;京都府,京都市,近畿;大阪府,大阪市,近畿;兵庫県,神戸市,近畿;奈良県,奈良市,近畿;和歌山県,和歌山市,近畿;" +
  "鳥取県,鳥取市,中国;島根県,松江市,中国;岡山県,岡山市,中国;広島県,広島市,中国;山口県,山口市,中国;徳島県,徳島市,四国;香川県,高松市,四国;愛媛県,松山市,四国;高知県,高知市,四国;" +
  "福岡県,福岡市,九州;佐賀県,佐賀市,九州;長崎県,長崎市,九州;熊本県,熊本市,九州;大分県,大分市,九州;宮崎県,宮崎市,九州;鹿児島県,鹿児島市,九州;沖縄県,那覇市,沖縄").split(";")
  .map(s => { const [name, cap, region] = s.split(","); return { name, cap, region }; });

const HTTP = { 100: "Continue: リクエストの続きを送ってよい", 101: "Switching Protocols: プロトコルを切り替える", 200: "OK: 成功", 201: "Created: リソースを作成した", 202: "Accepted: 受け付けたが処理は未完了",
  204: "No Content: 成功したが返す本文はない", 206: "Partial Content: 範囲指定で一部を返した", 301: "Moved Permanently: 恒久的に別のURLへ移動", 302: "Found: 一時的に別のURLへ移動",
  303: "See Other: 別のURLをGETで見に行く", 304: "Not Modified: 前回から変更なし（キャッシュを使う）", 307: "Temporary Redirect: 一時的な移動（メソッドを変えない）", 308: "Permanent Redirect: 恒久的な移動（メソッドを変えない）",
  400: "Bad Request: リクエストの形式が不正", 401: "Unauthorized: 認証が必要（未ログインなど）", 403: "Forbidden: 権限がなく拒否された", 404: "Not Found: 見つからない", 405: "Method Not Allowed: そのHTTPメソッドは使えない",
  408: "Request Timeout: リクエストの受信が時間切れ", 409: "Conflict: 現在の状態と競合した", 410: "Gone: 恒久的になくなった", 413: "Content Too Large: 送られた内容が大きすぎる", 414: "URI Too Long: URLが長すぎる",
  415: "Unsupported Media Type: 対応しない形式", 418: "I'm a teapot: ティーポットです（エイプリルフール由来）", 422: "Unprocessable Content: 形式は正しいが内容が処理できない", 429: "Too Many Requests: リクエストが多すぎる（レート制限）",
  500: "Internal Server Error: サーバー内部のエラー", 501: "Not Implemented: 未実装の機能", 502: "Bad Gateway: 上流サーバーから不正な応答", 503: "Service Unavailable: 一時的に利用できない（過負荷・保守中）", 504: "Gateway Timeout: 上流サーバーが時間切れ" };

// プログラミング辞典: k=話題判定の正規表現(小文字化したテキストに適用), t=見出し, b=説明とコード, r=参照URL
const KB = [
  { k: /array\.?\s*map|配列.*map|\.map\(|map関数|mapメソッド|(js|javascript).*(^|[^a-z])map(?![a-z])|(^|[^a-z])map(を|とは|って|の使い方)/, t: "JavaScript: Array.prototype.map", b: "配列の各要素に関数を適用し、結果を集めた「新しい配列」を返します（元の配列は変わりません）。\nconst doubled = [1, 2, 3].map(x => x * 2); // [2, 4, 6]", r: MDN("JavaScript/Reference/Global_Objects/Array/map") },
  { k: /array\.?\s*filter|配列.*filter|\.filter\(|filterメソッド/, t: "JavaScript: Array.prototype.filter", b: "条件を満たす要素だけを集めた新しい配列を返します。\nconst even = [1, 2, 3, 4].filter(x => x % 2 === 0); // [2, 4]", r: MDN("JavaScript/Reference/Global_Objects/Array/filter") },
  { k: /reduce/, t: "JavaScript: Array.prototype.reduce", b: "配列を1つの値にまとめます。第2引数は初期値です。\nconst sum = [1, 2, 3].reduce((acc, x) => acc + x, 0); // 6", r: MDN("JavaScript/Reference/Global_Objects/Array/reduce") },
  { k: /foreach/, t: "JavaScript: Array.prototype.forEach", b: "各要素に対して関数を実行します。戻り値はありません（新しい配列が欲しいときは map）。\n[1, 2].forEach(x => console.log(x));", r: MDN("JavaScript/Reference/Global_Objects/Array/forEach") },
  { k: /array\.?\s*find|配列.*find|\.find\(|findメソッド/, t: "JavaScript: Array.prototype.find", b: "条件を満たす最初の要素を返します（なければ undefined）。\nconst r = [5, 12, 8].find(x => x > 6); // 12", r: MDN("JavaScript/Reference/Global_Objects/Array/find") },
  { k: /includes/, t: "JavaScript: includes", b: "配列や文字列に、ある値・部分文字列が含まれるかを true/false で返します。\n[1, 2, 3].includes(2); // true\n'hello'.includes('ell'); // true", r: MDN("JavaScript/Reference/Global_Objects/Array/includes") },
  { k: /array\.?\s*sort|配列.*(ソート|並べ)|\.sort\(|sortメソッド/, t: "JavaScript: Array.prototype.sort", b: "配列を「その場で」並べ替えます。比較関数を渡さないと文字列順になるので、数値は比較関数が必要です。\n[10, 9, 1].sort((a, b) => a - b); // [1, 9, 10]", r: MDN("JavaScript/Reference/Global_Objects/Array/sort") },
  { k: /slice/, t: "JavaScript: slice", b: "配列や文字列の一部を新しく切り出します（元は変わりません）。終了位置は含みません。\n[1, 2, 3, 4].slice(1, 3); // [2, 3]", r: MDN("JavaScript/Reference/Global_Objects/Array/slice") },
  { k: /スプレッド|spread|\.\.\.演算子|展開構文/, t: "JavaScript: スプレッド構文", b: "配列やオブジェクトをその場で展開します。\nconst a = [1, 2]; const b = [...a, 3]; // [1, 2, 3]\nconst o = { ...{ x: 1 }, y: 2 }; // { x: 1, y: 2 }", r: MDN("JavaScript/Reference/Operators/Spread_syntax") },
  { k: /分割代入|destructuring/, t: "JavaScript: 分割代入", b: "配列やオブジェクトから値を取り出して変数に入れます。\nconst [a, b] = [1, 2];\nconst { x, y = 0 } = { x: 10 };", r: MDN("JavaScript/Reference/Operators/Destructuring") },
  { k: /アロー関数|arrow\s*function|=>/, t: "JavaScript: アロー関数", b: "短く書ける関数式です。this を外側から引き継ぎます。\nconst add = (a, b) => a + b;", r: MDN("JavaScript/Reference/Functions/Arrow_functions") },
  { k: /async|await|非同期/, t: "JavaScript: async / await", b: "Promise を同期処理のように書けます。await は async 関数の中で使います。\nasync function load() {\n  const res = await fetch('/data.json');\n  return await res.json();\n}", r: MDN("JavaScript/Reference/Statements/async_function") },
  { k: /promise/, t: "JavaScript: Promise", b: "「あとで結果が出る処理」を表すオブジェクトです。then / catch か await で結果を受け取ります。Promise.all([...]) で複数をまとめて待てます。", r: MDN("JavaScript/Reference/Global_Objects/Promise") },
  { k: /fetch/, t: "JavaScript: fetch", b: "HTTP通信を行います。ステータスは res.ok で確認し、失敗でも例外にならない点に注意。\nconst res = await fetch(url);\nif (!res.ok) throw new Error(res.status);\nconst data = await res.json();", r: MDN("API/Fetch_API/Using_Fetch") },
  { k: /クロージャ|closure/, t: "JavaScript: クロージャ", b: "関数が、自分が作られたときの外側の変数を覚えて使い続ける仕組みです。\nfunction counter() { let n = 0; return () => ++n; }\nconst c = counter(); c(); // 1\nc(); // 2", r: MDN("JavaScript/Guide/Closures") },
  { k: /オプショナルチェーン|optional\s*chaining/, t: "JavaScript: オプショナルチェーン ?.", b: "途中が null / undefined でもエラーにせず undefined を返します。\nconst city = user?.address?.city;", r: MDN("JavaScript/Reference/Operators/Optional_chaining") },
  { k: /let.*const.*var|var.*let|const.*let|let\s*と\s*const|letとconst/, t: "JavaScript: let / const / var", b: "const は再代入不可、let は再代入可（どちらもブロックスコープ）。var は関数スコープで巻き上げがあり、新しいコードでは使いません。まず const、必要なときだけ let が基本です。", r: MDN("JavaScript/Reference/Statements/let") },
  { k: /json/, t: "JavaScript: JSON", b: "JSON.stringify(obj) で文字列に、JSON.parse(str) でオブジェクトに戻します。parse は不正な文字列だと例外になるので try/catch で囲みます。", r: MDN("JavaScript/Reference/Global_Objects/JSON") },
  { k: /正規表現|regexp|regex/, t: "正規表現（JavaScript）", b: "パターンで文字列を検索・置換します。\n/\\d{3}-\\d{4}/.test('123-4567'); // true\n'a1b2'.replace(/\\d/g, '#'); // 'a#b#'\n主な記号: \\d 数字 / \\w 英数字_ / . 任意の1字 / * 0回以上 / + 1回以上 / ? 0または1回 / ^ 先頭 / $ 末尾", r: MDN("JavaScript/Reference/Global_Objects/RegExp") },
  { k: /\bset\b|セット.*js|new set/, t: "JavaScript: Set", b: "重複しない値の集まり。\nconst s = new Set([1, 1, 2]); s.size; // 2\n配列の重複除去: [...new Set(arr)]", r: MDN("JavaScript/Reference/Global_Objects/Set") },
  { k: /new map|\bmap\b.*オブジェクト|js.*\bmap\b型|mapオブジェクト/, t: "JavaScript: Map", b: "任意の型をキーにできる連想配列。\nconst m = new Map([['a', 1]]); m.get('a'); // 1", r: MDN("JavaScript/Reference/Global_Objects/Map") },
  { k: /クラス.*(js|javascript)|(js|javascript).*クラス|class\s+\w+\s*\{/, t: "JavaScript: クラス", b: "class Dog {\n  constructor(name) { this.name = name; }\n  bark() { return this.name + ' wan'; }\n}\nclass Puppy extends Dog {}", r: MDN("JavaScript/Reference/Classes") },
  { k: /try.*catch|例外処理.*(js|javascript)/, t: "JavaScript: try...catch", b: "try { riskyCall(); } catch (e) { console.error(e); } finally { cleanup(); }", r: MDN("JavaScript/Reference/Statements/try...catch") },
  { k: /addeventlistener|イベントリスナ/, t: "JavaScript: addEventListener", b: "要素にイベント処理を登録します。\nbutton.addEventListener('click', e => { console.log('clicked'); });", r: MDN("API/EventTarget/addEventListener") },
  { k: /queryselector/, t: "JavaScript: querySelector", b: "CSSセレクターで最初に一致する要素を取得します（全部は querySelectorAll）。\nconst el = document.querySelector('#id .class');", r: MDN("API/Document/querySelector") },
  { k: /localstorage|ローカルストレージ|webストレージ/, t: "Web Storage（localStorage）", b: "ブラウザに文字列を保存します（ドメインごと・容量は数MB）。\nlocalStorage.setItem('k', 'v');\nlocalStorage.getItem('k');\nプライベートモード等で例外になることがあるため try/catch で囲むと安全です。", r: MDN("API/Web_Storage_API") },
  { k: /テンプレートリテラル|template\s*literal/, t: "JavaScript: テンプレートリテラル", b: "バッククォートで文字列に式を埋め込めます。\nconst msg = `こんにちは、${name}さん`;", r: MDN("JavaScript/Reference/Template_literals") },
  { k: /tofixed|小数点.*(js|javascript)|(js|javascript).*小数/, t: "JavaScript: Number.prototype.toFixed", b: "小数点以下の桁数をそろえた文字列を返します。\n(3.14159).toFixed(2); // '3.14'", r: MDN("JavaScript/Reference/Global_Objects/Number/toFixed") },
  { k: /リスト内包|list\s*comprehension|内包表記/, t: "Python: リスト内包表記", b: "ループと条件をまとめて、リストを1行で作れます。\nsquares = [x * x for x in range(5)]  # [0, 1, 4, 9, 16]\nevens = [x for x in range(10) if x % 2 == 0]", r: PY("tutorial/datastructures") },
  { k: /python.*(辞書|dict)|辞書型|dict型/, t: "Python: 辞書 (dict)", b: "キーと値の対応表です。\nd = {'a': 1}\nd['b'] = 2\nd.get('c', 0)  # キーがなければ 0\nfor k, v in d.items(): ...", r: PY("tutorial/datastructures") },
  { k: /python.*(タプル|tuple)|タプル/, t: "Python: タプル", b: "変更できない（イミュータブルな）並びです。t = (1, 2, 3)。辞書のキーにも使えます。", r: PY("tutorial/datastructures") },
  { k: /python.*(リスト|list)|リスト型/, t: "Python: リスト", b: "変更できる並びです。\nxs = [1, 2]\nxs.append(3); xs.sort(); xs[0]; xs[-1]; xs[1:]", r: PY("tutorial/datastructures") },
  { k: /f文字列|f-string|fstring|フォーマット文字列/, t: "Python: f文字列", b: "文字列に式を埋め込みます。\nname = '太郎'\nprint(f'こんにちは、{name}さん {3 * 4}')\n小数: f'{3.14159:.2f}' → '3.14'", r: PY("tutorial/inputoutput") },
  { k: /例外処理.*python|python.*(例外|try)|try.*except|except/, t: "Python: try / except", b: "try:\n    risky()\nexcept ValueError as e:\n    print(e)\nelse:\n    ...  # 例外がなかったとき\nfinally:\n    ...  # 必ず実行", r: PY("tutorial/errors") },
  { k: /python.*クラス|クラス.*python|__init__/, t: "Python: クラス", b: "class Dog:\n    def __init__(self, name):\n        self.name = name\n    def bark(self):\n        return f'{self.name} wan'", r: PY("tutorial/classes") },
  { k: /python.*(正規表現|re\b)|import re/, t: "Python: re モジュール", b: "import re\nre.search(r'\\d+', 'abc123').group()  # '123'\nre.findall(r'\\d', 'a1b2')  # ['1', '2']\nre.sub(r'\\s+', ' ', text)", r: PY("library/re") },
  { k: /python.*json|json.*python/, t: "Python: json モジュール", b: "import json\ns = json.dumps(obj, ensure_ascii=False)\nobj = json.loads(s)", r: PY("library/json") },
  { k: /venv|仮想環境/, t: "Python: 仮想環境 (venv)", b: "python -m venv .venv\nsource .venv/bin/activate   # Windows: .venv\\Scripts\\activate\npip install requests", r: PY("tutorial/venv") },
  { k: /python.*(for|if|while|制御)|range\(/, t: "Python: 制御構文", b: "for i in range(3): print(i)\nif x > 0: ...\nelif x == 0: ...\nelse: ...\nwhile cond: ...\nインデント（空白4つ）でブロックを表します。", r: PY("tutorial/controlflow") },
  { k: /git.*rebase|rebase/, t: "Git: rebase", b: "ブランチのコミットを別の土台の上に付け替えて、履歴を一直線にします。\ngit rebase main\n公開済みのブランチを rebase すると履歴が書き換わるので注意（共有ブランチでは避けます）。", r: GIT("rebase") },
  { k: /git.*stash|stash/, t: "Git: stash", b: "作業中の変更を一時退避します。\ngit stash\ngit stash pop   # 戻す\ngit stash list", r: GIT("stash") },
  { k: /git.*reset|reset/, t: "Git: reset", b: "HEADやインデックスを過去の状態へ戻します。\ngit reset --soft HEAD~1   # コミットだけ取り消し、変更は残す\ngit reset --hard HEAD~1   # 変更も捨てる（取り消し困難）", r: GIT("reset") },
  { k: /cherry-?pick/, t: "Git: cherry-pick", b: "他のブランチの特定のコミットだけを取り込みます。\ngit cherry-pick <コミットID>", r: GIT("cherry-pick") },
  { k: /git.*revert|revert/, t: "Git: revert", b: "あるコミットを打ち消す「新しいコミット」を作ります。履歴を書き換えないので共有ブランチで安全です。\ngit revert <コミットID>", r: GIT("revert") },
  { k: /amend|直前のコミット/, t: "Git: commit --amend", b: "直前のコミットを修正します（メッセージや内容）。\ngit commit --amend\n公開済みなら履歴が書き換わるため注意。", r: GIT("commit") },
  { k: /git.*merge|マージ.*git|merge/, t: "Git: merge", b: "別のブランチの変更を現在のブランチに統合します。\ngit switch main\ngit merge feature\n競合したらファイルを編集して git add → git commit。", r: GIT("merge") },
  { k: /git.*(switch|checkout|ブランチ.*(切り替|変更|作))|git.*branch/, t: "Git: ブランチ操作", b: "git branch            # 一覧\ngit switch -c feature  # 作って切り替え\ngit switch main        # 切り替え", r: GIT("switch") },
  { k: /git.*(push|プッシュ)/, t: "Git: push", b: "ローカルのコミットをリモートに送ります。\ngit push -u origin <ブランチ名>   # 初回は上流を設定", r: GIT("push") },
  { k: /git.*(pull|プル)|git.*fetch/, t: "Git: pull / fetch", b: "fetch はリモートの更新を取得するだけ、pull は fetch + 統合（merge か rebase）です。\ngit fetch origin\ngit pull", r: GIT("pull") },
  { k: /git.*clone/, t: "Git: clone", b: "git clone <URL>   # リポジトリを複製", r: GIT("clone") },
  { k: /git.*(log|履歴)/, t: "Git: log", b: "git log --oneline --graph   # 履歴を1行・グラフで表示", r: GIT("log") },
  { k: /git.*(status|状態)/, t: "Git: status", b: "git status   # 変更・ステージの状態を確認", r: GIT("status") },
  { k: /git.*(diff|差分)|^diff/, t: "Git: diff", b: "git diff            # 作業ツリーとインデックスの差\ngit diff --staged   # ステージ済みの差", r: GIT("diff") },
  { k: /git.*(add|ステージ)/, t: "Git: add", b: "git add <ファイル>   # コミット対象に追加\ngit add -p           # 変更を部分ごとに選ぶ", r: GIT("add") },
  { k: /git.*restore|変更を(元に戻|破棄)/, t: "Git: restore", b: "git restore <ファイル>            # 作業ツリーの変更を破棄（戻せません）\ngit restore --staged <ファイル>   # ステージを取り消し", r: GIT("restore") },
  { k: /git.*tag|タグ.*git/, t: "Git: tag", b: "git tag v1.0.0\ngit push origin v1.0.0", r: GIT("tag") },
  { k: /flexbox|フレックス|display:\s*flex|justify-content|align-items/, t: "CSS: Flexbox", b: "1次元（横または縦）の並べ方を決めます。\n.box { display: flex; flex-direction: row; justify-content: center; align-items: center; gap: 8px; }\njustify-content は主軸方向、align-items は交差軸方向の揃えです。", r: MDN("CSS/Guides/Flexible_box_layout/Basic_concepts") },
  { k: /css.*grid|グリッド.*css|grid-template/, t: "CSS: Grid", b: "2次元（行と列）のレイアウトです。\n.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }", r: MDN("CSS/Guides/Grid_layout/Basic_concepts") },
  { k: /html.*(リンク|aタグ|アンカー)|<a\b|aタグ/, t: "HTML: a 要素（リンク）", b: "<a href=\"https://example.com\" target=\"_blank\" rel=\"noopener noreferrer\">リンク</a>\n別タブで開くときは rel=\"noopener noreferrer\" を付けると安全です。", r: MDN("HTML/Reference/Elements/a") },
  { k: /html.*(フォーム|form)|<form/, t: "HTML: form 要素", b: "<form action=\"/submit\" method=\"post\">\n  <label>名前 <input name=\"name\" required></label>\n  <button>送信</button>\n</form>", r: MDN("HTML/Reference/Elements/form") },
  { k: /ステータスコード|httpステータス|http status|status code/, t: "HTTPステータスコード", b: "100番台: 情報 / 200番台: 成功 / 300番台: リダイレクト / 400番台: クライアント側のエラー / 500番台: サーバー側のエラー\n番号を入れて「404とは」のように聞くと個別に答えます。", r: MDN("HTTP/Reference/Status") },
];

function knowledgeAnswer(t0) {
  const t = zen2han(t0), lower = t.toLowerCase();
  let m;
  // HTTP ステータス
  if ((m = /\b([1-5]\d\d)\b/.exec(t)) && HTTP[m[1]] && (/(http|ステータス|status|エラー)/i.test(t) || (+m[1] >= 400 && /(とは|って|意味)/.test(t)))) return { text: `HTTP ${m[1]} — ${HTTP[m[1]]}`, refs: [MDN("HTTP/Reference/Status/" + m[1])] };
  // 元素
  if (/(元素|原子番号|元素記号)/.test(t) || /^[A-Z][a-z]?\s*(とは|は|って)/.test(t.trim())) {
    if ((m = /原子番号\s*(\d{1,3})/.exec(t)) || (m = /(\d{1,3})\s*番(?:目)?の?元素/.exec(t))) { const e = ELEMENTS[+m[1] - 1]; return e ? { text: `原子番号${e.z}は ${e.name}（元素記号 ${e.sym}）です。` } : { text: "原子番号は1〜118です。" }; }
    const bySym = ELEMENTS.find(e => new RegExp("(^|[^A-Za-z])" + e.sym + "([^a-z]|$)").test(t) && /(元素|記号|とは|は何|って)/.test(t) && !/[ぁ-んァ-ン一-龥]{3,}の元素記号/.test(t));
    const byName = ELEMENTS.slice().sort((a, b) => b.name.length - a.name.length).find(e => t.includes(e.name));
    const e = byName || bySym;
    if (e) return { text: `${e.name}の元素記号は ${e.sym}、原子番号は ${e.z} です。` };
  }
  // 都道府県
  const pf = PREF.find(p => t.includes(p.name) || (p.name.length > 2 && t.includes(p.name.slice(0, -1)) && /(県庁所在地|都道府県|県庁|府庁|道庁|都庁)/.test(t)));
  if (pf && /(県庁所在地|県庁|府庁|道庁|都庁|首都|庁)/.test(t)) return { text: `${pf.name}の県庁所在地は ${pf.cap} です（${pf.region}地方）。` };
  if ((m = /(北海道|東北|関東|中部|近畿|中国|四国|九州|沖縄)(?:地方)?の?(?:都道府県|県)/.exec(t))) return { text: `${m[1]}地方の都道府県: ${PREF.filter(p => p.region === m[1]).map(p => p.name).join("、")}\n（区分は一般的なもので、三重県は近畿、新潟県は中部として扱っています）` };
  if (/(都道府県).*(いくつ|何個|数)/.test(t)) return { text: "日本の都道府県は47です（1都1道2府43県）。" };
  const cityPf = /(?:^|[^一-龥])([一-龥ぁ-ん]{2,5}?)市?は(?:何県|どこの県|何府|何都|どの県)/.exec(t);
  if (cityPf) { const c = PREF.find(p => p.cap.replace(/（.*/, "").replace(/市$/, "") === cityPf[1].replace(/市$/, "")); if (c) return { text: `${cityPf[1]}は ${c.name} の県庁所在地です。` }; }
  // プログラミング辞典
  const hits = KB.filter(e => e.k.test(lower));
  if (hits.length) {
    const h = hits[0];
    return { text: `【${h.t}】\n${h.b}`, refs: [h.r] };
  }
  if (/(プログラミング|コード).*(教えて|できる|質問)|何の言語/.test(t)) return { text: "JavaScript（配列・非同期・fetch など）、Python（リスト内包・例外・正規表現 など）、Git（rebase / stash / reset など）、CSS（Flexbox / Grid）、HTML、HTTPステータスの辞典があります。例:「reduceとは」「git rebase」「404とは」" };
  return null;
}

// ---------- 追加: 日本の祝日（2022〜2099年。国民の祝日に関する法律の規定を計算で再現） ----------
const HOLI_RANGE = [2022, 2099];
function nthMonday(y, m, n) { const off = (1 - dow(y, m, 1) + 7) % 7; return 1 + off + 7 * (n - 1); }
function equinox(y, spring) {                  // 1980〜2099年に使われる近似式
  const base = spring ? 20.8431 : 23.2488;
  return Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}
const holidayCache = {};
function holidaysOf(y) {
  if (holidayCache[y]) return holidayCache[y];
  const H = new Map();                         // dayNum -> 名前
  const add = (m, d, name) => H.set(dayNum(y, m, d), name);
  add(1, 1, "元日"); add(1, nthMonday(y, 1, 2), "成人の日"); add(2, 11, "建国記念の日"); add(2, 23, "天皇誕生日");
  add(3, equinox(y, true), "春分の日"); add(4, 29, "昭和の日"); add(5, 3, "憲法記念日"); add(5, 4, "みどりの日"); add(5, 5, "こどもの日");
  add(7, nthMonday(y, 7, 3), "海の日"); add(8, 11, "山の日"); add(9, nthMonday(y, 9, 3), "敬老の日"); add(9, equinox(y, false), "秋分の日");
  add(10, nthMonday(y, 10, 2), "スポーツの日"); add(11, 3, "文化の日"); add(11, 23, "勤労感謝の日");
  const base = [...H.keys()].sort((a, b) => a - b);
  for (const d of base) {                      // 国民の休日: 前日と翌日が祝日の平日(日曜以外)
    const nx = d + 2;
    if (H.has(nx) && !H.has(d + 1) && fromDayNum(d + 1) && dow(...fromDayNum(d + 1)) !== 0) H.set(d + 1, "国民の休日");
  }
  for (const d of [...H.keys()].sort((a, b) => a - b)) {   // 振替休日: 日曜の祝日の次の「祝日でない日」
    if (H.get(d) !== "国民の休日" && dow(...fromDayNum(d)) === 0) { let k = d + 1; while (H.has(k)) k++; H.set(k, "振替休日"); }
  }
  return (holidayCache[y] = [...H.entries()].sort((a, b) => a[0] - b[0]).map(([n, name]) => ({ ymd: fromDayNum(n), n, name })));
}
const LAW = "https://laws.e-gov.go.jp/law/323AC1000000178";
function holidayAnswer(t0, now) {
  const t = zen2han(t0);
  if (!/(祝日|休日|成人の日|建国記念の日|天皇誕生日|春分の日|昭和の日|憲法記念日|みどりの日|こどもの日|海の日|山の日|敬老の日|秋分の日|スポーツの日|文化の日|勤労感謝の日|元日|振替)/.test(t)) return null;
  const [ty] = todayOf(now);
  const ym = /(\d{4})\s*年/.exec(t);
  let y = ym ? +ym[1] : /来年/.test(t) ? ty + 1 : /去年|昨年/.test(t) ? ty - 1 : ty;
  const out = (text) => ({ text, refs: [LAW] });
  if (y < HOLI_RANGE[0] || y > HOLI_RANGE[1]) return { text: `祝日の計算は ${HOLI_RANGE[0]}〜${HOLI_RANGE[1]}年に対応しています（それ以前は法改正や特例が多いため対象外です）。` };
  const pd = /(\d{4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})/.exec(t);
  if (pd && /祝日|休日/.test(t)) {
    const ymd = [+pd[1], +pd[2], +pd[3]];
    if (!validYMD(ymd)) return { text: "存在しない日付です。" };
    if (ymd[0] < HOLI_RANGE[0] || ymd[0] > HOLI_RANGE[1]) return { text: `祝日の計算は ${HOLI_RANGE[0]}〜${HOLI_RANGE[1]}年に対応しています。` };
    const h = holidaysOf(ymd[0]).find(x => x.n === dayNum(...ymd));
    return out(h ? `${dstr(...ymd)} は祝日（休日）です: ${h.name}` : `${dstr(...ymd)} は祝日ではありません${dow(...ymd) === 0 || dow(...ymd) === 6 ? "（週末です）" : "（平日です）"}。`);
  }
  if (/(次|つぎ|直近|これから)/.test(t)) {
    const tn = dayNum(...todayOf(now));
    for (let yy = ty; yy <= Math.min(ty + 1, HOLI_RANGE[1]); yy++) { const h = holidaysOf(yy).find(x => x.n > tn); if (h) return out(`次の祝日は ${dstr(...h.ymd)} の「${h.name}」です（あと${h.n - tn}日）。`); }
  }
  const nameQ = ["成人の日", "建国記念の日", "天皇誕生日", "春分の日", "昭和の日", "憲法記念日", "みどりの日", "こどもの日", "海の日", "山の日", "敬老の日", "秋分の日", "スポーツの日", "文化の日", "勤労感謝の日", "元日", "振替休日", "国民の休日"].find(n => t.includes(n));
  if (nameQ) {
    const hs = holidaysOf(y).filter(x => x.name === nameQ);
    if (hs.length) return out(`${y}年の${nameQ}は ${hs.map(h => dstr(...h.ymd)).join("、")} です。`);
  }
  if (/祝日/.test(t) || (ym && /休日/.test(t))) return out(`${y}年の祝日（${holidaysOf(y).length}日）:\n` + holidaysOf(y).map(h => `${h.ymd[1]}/${h.ymd[2]}(${WD[dow(...h.ymd)]}) ${h.name}`).join("\n"));
  return null;
}

// ---------- 追加: 世界の国と首都・その他の知識 ----------
const COUNTRY = ("日本,東京;中国,北京;韓国,ソウル;北朝鮮,平壌;モンゴル,ウランバートル;インド,ニューデリー;パキスタン,イスラマバード;バングラデシュ,ダッカ;ネパール,カトマンズ;スリランカ,スリジャヤワルダナプラコッテ（行政上の首都。最大都市はコロンボ）;" +
  "タイ,バンコク;ベトナム,ハノイ;ラオス,ビエンチャン;カンボジア,プノンペン;ミャンマー,ネピドー;マレーシア,クアラルンプール;シンガポール,シンガポール;フィリピン,マニラ;" +
  "オーストラリア,キャンベラ;ニュージーランド,ウェリントン;アメリカ,ワシントンD.C.;カナダ,オタワ;メキシコ,メキシコシティ;ブラジル,ブラジリア;アルゼンチン,ブエノスアイレス;チリ,サンティアゴ;ペルー,リマ;コロンビア,ボゴタ;" +
  "イギリス,ロンドン;フランス,パリ;ドイツ,ベルリン;イタリア,ローマ;スペイン,マドリード;ポルトガル,リスボン;オランダ,アムステルダム;ベルギー,ブリュッセル;スイス,ベルン;オーストリア,ウィーン;" +
  "スウェーデン,ストックホルム;ノルウェー,オスロ;フィンランド,ヘルシンキ;デンマーク,コペンハーゲン;アイスランド,レイキャビク;アイルランド,ダブリン;ポーランド,ワルシャワ;チェコ,プラハ;ハンガリー,ブダペスト;ギリシャ,アテネ;" +
  "トルコ,アンカラ;ロシア,モスクワ;ウクライナ,キーウ;サウジアラビア,リヤド;イラン,テヘラン;イラク,バグダッド;アラブ首長国連邦,アブダビ;カタール,ドーハ;" +
  "エジプト,カイロ;南アフリカ,プレトリア（行政の首都。立法はケープタウン、司法はブルームフォンテーン）;ナイジェリア,アブジャ;ケニア,ナイロビ;エチオピア,アディスアベバ;モロッコ,ラバト")
  .split(";").map(x => { const [name, cap] = x.split(","); return { name, cap }; });
const PLANETS = ["水星", "金星", "地球", "火星", "木星", "土星", "天王星", "海王星"];
const IRREG = ("be,was/were,been;go,went,gone;do,did,done;have,had,had;see,saw,seen;take,took,taken;make,made,made;get,got,got/gotten;give,gave,given;come,came,come;run,ran,run;eat,ate,eaten;write,wrote,written;read,read,read;speak,spoke,spoken;" +
  "buy,bought,bought;bring,brought,brought;think,thought,thought;teach,taught,taught;catch,caught,caught;know,knew,known;begin,began,begun;drink,drank,drunk;sing,sang,sung;swim,swam,swum;choose,chose,chosen;break,broke,broken;forget,forgot,forgotten;" +
  "find,found,found;leave,left,left;meet,met,met;tell,told,told;say,said,said;sit,sat,sat;stand,stood,stood;understand,understood,understood;keep,kept,kept;feel,felt,felt;hold,held,held;lose,lost,lost;pay,paid,paid;send,sent,sent;build,built,built;" +
  "fall,fell,fallen;fly,flew,flown;grow,grew,grown;draw,drew,drawn;wear,wore,worn;drive,drove,driven;ride,rode,ridden;sleep,slept,slept;sell,sold,sold;win,won,won;hear,heard,heard;put,put,put;cut,cut,cut;let,let,let;hit,hit,hit")
  .split(";").map(x => { const [base, past, pp] = x.split(","); return { base, past, pp }; });
const MONTH_JP = ["睦月", "如月", "弥生", "卯月", "皐月", "水無月", "文月", "葉月", "長月", "神無月", "霜月", "師走"];
const MONTH_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SI = [["ロナ", "R", 27], ["ヨタ", "Y", 24], ["ゼタ", "Z", 21], ["エクサ", "E", 18], ["ペタ", "P", 15], ["テラ", "T", 12], ["ギガ", "G", 9], ["メガ", "M", 6], ["キロ", "k", 3], ["ヘクト", "h", 2], ["デカ", "da", 1],
  ["デシ", "d", -1], ["センチ", "c", -2], ["ミリ", "m", -3], ["マイクロ", "μ", -6], ["ナノ", "n", -9], ["ピコ", "p", -12], ["フェムト", "f", -15], ["アト", "a", -18], ["ゼプト", "z", -21], ["ヨクト", "y", -24], ["ロント", "r", -27]];
const CONST = [
  [/光速/, "真空中の光の速さ c = 299 792 458 m/s（定義値・厳密）"],
  [/重力加速度/, "標準重力加速度 gₙ = 9.80665 m/s²（定義値）"],
  [/アボガドロ/, "アボガドロ定数 Nₐ = 6.022 140 76 × 10²³ /mol（2019年改定SIの定義値・厳密）"],
  [/プランク定数/, "プランク定数 h = 6.626 070 15 × 10⁻³⁴ J·s（定義値・厳密）"],
  [/ボルツマン/, "ボルツマン定数 k = 1.380 649 × 10⁻²³ J/K（定義値・厳密）"],
  [/電気素量|素電荷/, "電気素量 e = 1.602 176 634 × 10⁻¹⁹ C（定義値・厳密）"],
  [/円周率|パイ|π/, "円周率 π = 3.14159265358979323846…"],
  [/ネイピア数|自然対数の底/, "ネイピア数 e = 2.71828182845904523536…"],
  [/黄金比/, "黄金比 φ = (1+√5)/2 = 1.6180339887498948482…"],
];
const SI_REF = "https://www.bipm.org/en/measurement-units";
function toRoman(n) { const a = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]; let r = ""; for (const [v, s] of a) while (n >= v) { r += s; n -= v; } return r; }
function fromRoman(s) { const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }; let r = 0; for (let i = 0; i < s.length; i++) { const c = v[s[i]], nx = v[s[i + 1]] || 0; r += c < nx ? -c : c; } return r; }

function extraAnswer(t0) {
  const t = zen2han(t0); let m;
  // 料理の計量
  if ((m = /(大さじ|小さじ)\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?\s*(?:杯)?/.exec(t)) && /(ml|cc|ミリ|グラム|何|いくつ|cc)/i.test(t)) {
    const unit = m[1] === "大さじ" ? 15 : 5, k = m[3] ? +m[2] / +m[3] : +m[2];
    return { text: `${m[1]}${m[3] ? m[2] + "/" + m[3] : m[2]} = ${fmt(unit * k)} mL（大さじ1=15mL、小さじ1=5mL、1カップ=200mL）` };
  }
  // ローマ数字
  if ((m = /(\d{1,4})\s*(?:を|は)?\s*ローマ数字/.exec(t))) { const n = +m[1]; return n >= 1 && n <= 3999 ? { text: `${n} = ${toRoman(n)}` } : { text: "ローマ数字は1〜3999で表せます。" }; }
  if ((m = /\b([IVXLCDM]{1,15})\b/.exec(t)) && /(ローマ数字|アラビア数字|数字に|いくつ)/.test(t)) { const n = fromRoman(m[1]); return toRoman(n) === m[1] ? { text: `${m[1]} = ${n}` } : { text: `「${m[1]}」は正しいローマ数字の並びではありません。` }; }
  // 国と首都
  const cn = COUNTRY.slice().sort((a, b) => b.name.length - a.name.length).find(c => t.includes(c.name));
  if (cn && /(首都|都)/.test(t) && !/(都道府県|東京都)/.test(t.replace(cn.name, ""))) return { text: `${cn.name}の首都は ${cn.cap} です。` };
  if ((m = /([一-龥ァ-ヶー]{2,10}?)は(?:どこの国|何という国|どの国)の(?:首都|都市)/.exec(t))) { const c = COUNTRY.find(x => x.cap.replace(/（.*/, "") === m[1]); if (c) return { text: `${m[1]}は ${c.name} の首都です。` }; }
  if (/惑星/.test(t) && /(順|いくつ|何個|一覧|太陽系)/.test(t)) return { text: `太陽系の惑星は8つで、太陽に近い順に ${PLANETS.join("、")} です。`, refs: [] };
  // 英語
  if (/(不規則動詞)/.test(t) && !/[a-z]{2,}/i.test(t.replace(/不規則動詞/g, ""))) return { text: "不規則動詞の例（原形-過去形-過去分詞）:\n" + IRREG.slice(0, 20).map(v => `${v.base} - ${v.past} - ${v.pp}`).join("\n") + "\n動詞を入れて「goの過去形」のように聞くと個別に答えます。（全" + IRREG.length + "語収録）" };
  if (/(過去形|過去分詞|活用|不規則)/.test(t)) {
    const w = (/([a-z]+)/i.exec(t) || [])[1]; const v = w && IRREG.find(x => x.base === w.toLowerCase() || x.past.split("/").includes(w.toLowerCase()) || x.pp.split("/").includes(w.toLowerCase()));
    if (v) return { text: `${v.base}（原形）- ${v.past}（過去形）- ${v.pp}（過去分詞）` };
  }
  // 月の名前
  if ((m = /(\d{1,2})\s*月.*(英語|和風|旧暦|異名|呼び名|別名)/.exec(t)) && +m[1] >= 1 && +m[1] <= 12) {
    const i = +m[1] - 1; return { text: `${m[1]}月 — 英語: ${MONTH_EN[i]} / 和風月名（旧暦の異名）: ${MONTH_JP[i]}` };
  }
  if (/和風月名|旧暦の月/.test(t)) return { text: MONTH_JP.map((n, i) => `${i + 1}月 ${n}`).join("、") };
  // SI接頭語
  if (/(接頭語|接頭辞)/.test(t)) return { text: "SI接頭語:\n" + SI.map(([n, s, e]) => `${n}(${s}) = 10^${e}`).join("\n"), refs: [SI_REF] };
  const si = SI.find(([n]) => t.includes(n)) ; if (si && /(10の何乗|何倍|いくつ|倍率)/.test(t)) return { text: `${si[0]}(${si[1]}) = 10^${si[2]}`, refs: [SI_REF] };
  // 物理定数
  const c = CONST.find(([re]) => re.test(t)); if (c && t.length <= 24 && /(とは|いくつ|値|教えて|は|何)/.test(t)) return { text: c[1], refs: /定義値/.test(c[1]) ? [SI_REF] : [] };
  return null;
}

// ---------- 入口 ----------
async function answer(text, now) {
  now = now || new Date();
  const t = String(text).trim();
  if (!t) return null;
  for (const fn of [
    () => dateAnswer(t, now),
    () => holidayAnswer(t, now),
    () => clockAnswer(t, now),
    () => extraAnswer(t),
    () => mathAnswer(t),
    () => convertUnits(t),
    () => textAnswer(t, now),
    () => knowledgeAnswer(t),
    () => calcAnswer(t),
  ]) {
    const r = await fn();
    if (r) return r;
  }
  return null;
}

const api = { holidaysOf, answer, calc, convertUnits, dateAnswer, mathAnswer, knowledgeAnswer, ELEMENTS, PREF, HTTP, KB, eto, factorize };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Tools = api;
})(typeof window !== "undefined" ? window : globalThis);
