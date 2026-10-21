/* 論文検索（OpenAlex / Crossref の公開API。キー不要）
 * Papers.intent(text) → {kind:"doi",doi} | {kind:"search",q,sort} | {kind:"ask"} | null
 * Papers.run(intent, getJSON, now) → Promise<string>
 * 仕様の出典:
 *  - OpenAlex: https://docs.openalex.org/ （works の search / select / sort / per-page / DOI での取得）
 *  - Crossref: https://github.com/CrossRef/rest-api-doc （/works/{doi}, query.bibliographic, select）
 */
(function (root) {
"use strict";
const pad = n => String(n).padStart(2, "0");
const today = n => `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
const OA = "https://api.openalex.org/works";
const CR = "https://api.crossref.org/works";

function intent(t0) {
  const t = String(t0).trim();
  const d = /\b(10\.\d{4,9}\/[^\s"<>「」、。]+)/.exec(t);
  if (d) return { kind: "doi", doi: d[1].replace(/[.,;:)\]]+$/, "") };
  const isPaper = /(論文|文献|学術|ペーパー|研究(?:成果|報告)|\bpapers?\b|\bpreprint\b|arxiv)/i.test(t);
  if (!isPaper) return null;
  let sort = null;
  if (/(引用数?の?多い|引用の多い|被引用|有名な|重要な|代表的な|影響力|most cited|highly cited)/i.test(t)) sort = "cited_by_count:desc";
  else if (/(最新|新しい|最近の|latest|recent)/i.test(t)) sort = "publication_date:desc";
  let q = "";
  let m = /\bpapers?\s+(?:about|on|regarding)\s+(.+)$/i.exec(t);
  if (m) q = m[1];
  else {
    q = t.replace(/(引用数?の?多い|引用の多い|被引用|有名な|重要な|代表的な|影響力のある|最新の|最新|新しい|最近の)/g, "")
         .replace(/(に関する|についての|に関して|について|の|に関連する|関連の)?\s*(論文|文献|研究成果|研究報告|ペーパー|papers?)\s*(を|は|って|が)?\s*(探して|さがして|探したい|教えて|検索して|検索|見せて|紹介して|ありますか|ください|調べて|知りたい|出して|リスト)?(ください)?[?？。!！]*$/i, "")
         .replace(/[?？。!！]+$/g, "").trim();
  }
  q = q.replace(/\s+/g, " ").trim();
  return q.length >= 2 ? { kind: "search", q, sort } : { kind: "ask" };
}

const authorsOf = (list, n = 3) => {
  const names = (list || []).map(a => a && a.author && a.author.display_name).filter(Boolean);
  return names.length ? names.slice(0, n).join(", ") + (names.length > n ? ` 他${names.length - n}名` : "") : "著者情報なし";
};

function fmtOA(w, i) {
  const src = w.primary_location && w.primary_location.source && w.primary_location.source.display_name;
  const link = w.doi || w.id;
  return `${i}. ${w.display_name || "(題名なし)"}（${w.publication_year ?? "年不明"}）\n   著者: ${authorsOf(w.authorships)}\n   掲載: ${src || "不明"} / 被引用 ${w.cited_by_count ?? 0}回\n   ${link}`;
}

async function run(it, getJSON, now) {
  now = now || new Date();
  if (it.kind === "ask") return "探したい分野やキーワードを入れてください。例:「quantum error correction の論文」「attention is all you need の論文」「最新のブラックホールの論文」（英語のキーワードのほうが見つかりやすいです）";
  if (it.kind === "doi") {
    try {
      const w = await getJSON(`${OA}/https://doi.org/${encodeURI(it.doi)}?select=id,doi,display_name,publication_year,cited_by_count,authorships,primary_location`);
      if (w && w.display_name) return `DOI ${it.doi} の論文:\n${fmtOA(w, 1).replace(/^1\. /, "")}\n\n出典: OpenAlex ${w.id}\n取得日: ${today(now)}`;
    } catch (e) { /* Crossref に切り替える */ }
    try {
      const r = await getJSON(`${CR}/${encodeURI(it.doi)}`);
      const m = r && r.message; if (!m) return `DOI ${it.doi} は見つかりませんでした。`;
      const au = (m.author || []).map(a => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean);
      const yr = m.issued && m.issued["date-parts"] && m.issued["date-parts"][0] && m.issued["date-parts"][0][0];
      return `DOI ${it.doi} の論文:\n${(m.title && m.title[0]) || "(題名なし)"}（${yr ?? "年不明"}）\n   著者: ${au.length ? au.slice(0, 3).join(", ") + (au.length > 3 ? ` 他${au.length - 3}名` : "") : "著者情報なし"}\n   掲載: ${(m["container-title"] && m["container-title"][0]) || "不明"} / 被引用 ${m["is-referenced-by-count"] ?? 0}回\n   ${m.URL || "https://doi.org/" + it.doi}\n\n出典: Crossref ${CR}/${it.doi}\n取得日: ${today(now)}`;
    } catch (e) { return `DOI ${it.doi} は見つかりませんでした（${e.message}）。DOIの綴りを確認してください。`; }
  }
  const url = `${OA}?search=${encodeURIComponent(it.q)}&per-page=5&select=id,doi,display_name,publication_year,cited_by_count,authorships,primary_location` + (it.sort ? `&sort=${encodeURIComponent(it.sort)}` : "");
  const r = await getJSON(url);
  const rs = (r && r.results) || [];
  const hint = /[^\x00-\x7F]/.test(it.q) ? "\n（日本語のキーワードは見つかりにくいことがあります。英語でも試してください）" : "";
  if (!rs.length) return `「${it.q}」に合う論文は見つかりませんでした。${hint}`;
  const how = it.sort === "cited_by_count:desc" ? "被引用数の多い順" : it.sort === "publication_date:desc" ? "新しい順" : "関連度順";
  return `「${it.q}」の論文（${how}・上位${rs.length}件）:\n\n${rs.map((w, i) => fmtOA(w, i + 1)).join("\n\n")}${hint}\n\n出典: OpenAlex ${url}\n取得日: ${today(now)}\n※題名・被引用数はデータベースの記載で、内容の正しさを保証するものではありません。`;
}

const api = { intent, run, authorsOf };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Papers = api;
})(typeof window !== "undefined" ? window : globalThis);
