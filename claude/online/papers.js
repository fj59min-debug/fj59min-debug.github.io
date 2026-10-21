/* 文献検索（複数のデータベースを並列に検索。いずれもキー不要の公開API）
 * Papers.intent(text) → {kind, q, sort, sources, ...} | null
 * Papers.run(intent, getJSON, now) → Promise<string>
 *
 * 仕様の根拠:
 *  - OpenAlex   : https://docs.openalex.org/  （search / select / sort / per-page / DOI取得）               [公式ドキュメントで確認]
 *  - Crossref   : https://github.com/CrossRef/rest-api-doc （/works/{doi}, query.bibliographic, select, sort） [公式ドキュメントで確認]
 *  - INSPIRE-HEP: https://github.com/inspirehep/rest-api-doc （/api/literature, q, sort=mostcited|mostrecent, size, fields）[公式ドキュメントで確認]
 *  - Google Books: https://www.googleapis.com/discovery/v1/apis/books/v1/rest （volumes.list の q/maxResults/orderBy/printType/langRestrict、Volume.volumeInfo の項目）[公式Discoveryで確認]
 *  - Semantic Scholar / Europe PMC: 公式ドキュメントはこの環境から開けず、実際にそのAPIを使う第三者パッケージのコードで
 *    エンドポイントと項目名を確認（graph/v1/paper/search + paperId,title,year,venue,citationCount,externalIds,authors / europepmc/webservices/rest/search + resultList.result[].authorString,journalTitle,pubYear,citedByCount,doi,pmid）
 *  - 「他の検索先」のURLは各サイトの検索ページの一般的な形で、開けることの確認はしていない。
 */
(function (root) {
"use strict";
const pad = n => String(n).padStart(2, "0");
const today = n => `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
const E = encodeURIComponent;
const URLS = {
  oa: "https://api.openalex.org/works",
  cr: "https://api.crossref.org/works",
  s2: "https://api.semanticscholar.org/graph/v1/paper",
  inspire: "https://inspirehep.net/api/literature",
  epmc: "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
  books: "https://www.googleapis.com/books/v1/volumes",
};
const NAMES = { oa: "OpenAlex", cr: "Crossref", s2: "Semantic Scholar", inspire: "INSPIRE-HEP（物理・素粒子・天文）", epmc: "Europe PMC（医学・生命科学）", books: "Google Books" };
const PHYS = /(物理|素粒子|宇宙論|宇宙|天文|ブラックホール|量子|重力|暗黒物質|ニュートリノ|ヒッグス|ボソン|相対論|超弦|ひも理論|\b(physics|particle|quantum|gravity|gravitational|cosmolog\w*|astro\w*|boson|neutrino|dark matter|black hole|hep|lattice qcd|supersymmetr\w*)\b)/i;
const BIO = /(医学|医療|病気|疾患|がん|癌|ゲノム|遺伝子|タンパク|蛋白|薬|ワクチン|ウイルス|細胞|免疫|臨床|脳|神経|感染|\b(cancer|disease|gene|genome|protein|clinical|vaccine|virus|cell|immun\w*|medicine|medical|biolog\w*|neuro\w*|patients?|therapy|crispr)\b)/i;

// 「他の検索先」（自分で開く）
const links = q => [
  ["Google Scholar", `https://scholar.google.com/scholar?q=${E(q)}`],
  ["CiNii Research（日本の論文・本）", `https://cir.nii.ac.jp/all?q=${E(q)}`],
  ["J-STAGE（日本の学術誌）", `https://www.jstage.jst.go.jp/result/global/-char/ja?globalSearchKey=${E(q)}`],
  ["国立国会図書館サーチ", `https://ndlsearch.ndl.go.jp/search?cs=bib&keyword=${E(q)}`],
  ["arXiv", `https://arxiv.org/search/?searchtype=all&query=${E(q)}`],
  ["PubMed", `https://pubmed.ncbi.nlm.nih.gov/?term=${E(q)}`],
];

function intent(t0) {
  const t = String(t0).trim();
  const d = /\b(10\.\d{4,9}\/[^\s"<>「」、。]+)/.exec(t);
  if (d) return { kind: "doi", doi: d[1].replace(/[.,;:)\]]+$/, "") };
  const ax = /\barxiv[:\s]*((?:\d{4}\.\d{4,5})(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})/i.exec(t);
  if (ax) return { kind: "arxiv", id: ax[1] };
  const isbn = /isbn[:\s-]*([0-9][0-9-]{8,15}[0-9Xx])/i.exec(t);
  if (isbn) return { kind: "books", q: "isbn:" + isbn[1].replace(/-/g, ""), sort: null, sources: ["books"], raw: isbn[1] };

  const bookQ = /(?:の|を)\s*(本|書籍|図書|教科書|参考書|入門書)\s*(?:を|は|って)?\s*(探|おすすめ|教え|検索|紹介|ありますか|ください|知りたい|見せ)|\b(books?|textbooks?)\s+(about|on)\b|(おすすめの|良い|いい)(本|書籍|教科書|参考書)|(入門書|参考書|教科書|専門書|学術書)\s*(を|は)?\s*(探|おすすめ|教え|検索|紹介|ありますか|ください|知りたい)|おすすめ.{0,12}(本|書籍|入門書|参考書|教科書)/i.test(t);
  const isPaper = /(論文|文献|学術|ペーパー|研究(?:成果|報告)|\bpapers?\b|\bpreprints?\b|\bliterature\b)/i.test(t);
  if (!isPaper && !bookQ) return null;

  const sort = /(引用数?の?多い|引用の多い|被引用|有名な|重要な|代表的な|影響力|most cited|highly cited)/i.test(t) ? "cited"
    : /(最新|新しい|最近の|latest|recent|newest)/i.test(t) ? "new" : null;

  // 検索先の指定
  const want = [];
  if (/open\s*alex/i.test(t)) want.push("oa");
  if (/semantic\s*scholar|\bs2\b/i.test(t)) want.push("s2");
  if (/crossref|クロスレフ/i.test(t)) want.push("cr");
  if (/inspire|インスパイア/i.test(t)) want.push("inspire");
  if (/europe\s*pmc|pubmed|ピューブメド|ヨーロッパpmc/i.test(t)) want.push("epmc");
  if (/google\s*books|グーグルブックス/i.test(t)) want.push("books");
  const mentionsArxiv = /arxiv|アーカイブ/i.test(t);

  let q = t.replace(/(openalex|semantic\s*scholar|crossref|クロスレフ|inspire(?:-?hep)?|インスパイア|europe\s*pmc|pubmed|ピューブメド|google\s*books|グーグルブックス|arxiv|アーカイブ)\s*(で|の|から|を使って|経由で)?/gi, "");
  let m = /\b(?:papers?|books?|textbooks?|literature)\s+(?:about|on|regarding)\s+(.+)$/i.exec(q);
  if (m) q = m[1];
  else {
    q = q.replace(/(引用数?の?多い|引用の多い|被引用|有名な|重要な|代表的な|影響力のある|最新の|最新|新しい|最近の|おすすめの|良い|いい)/g, "")
         .replace(/(に関する|についての|に関して|について|の|に関連する|関連の)?\s*(論文|文献|研究成果|研究報告|ペーパー|papers?|本|書籍|図書|教科書|参考書|入門書|books?)\s*(を|は|って|が)?\s*(探して|さがして|探したい|教えて|検索して|検索|見せて|紹介して|ありますか|ください|調べて|知りたい|出して|リスト|全部|すべて|たくさん)?(ください)?[?？。!！]*$/i, "")
         .replace(/[?？。!！]+$/g, "");
  }
  q = q.replace(/\s+/g, " ").trim();
  if (q.length < 2) return { kind: "ask" };

  let sources = want;
  if (!sources.length) {
    if (bookQ && !isPaper) sources = ["books"];
    else {
      sources = ["oa", "s2", "cr"];
      if (PHYS.test(t) || PHYS.test(q)) sources.push("inspire");
      if (BIO.test(t) || BIO.test(q)) sources.push("epmc");
      if (bookQ) sources.push("books");
    }
  }
  return { kind: bookQ && !isPaper && !want.length ? "books" : "search", q, sort, sources, mentionsArxiv };
}

// ---------- 各データベースの検索 → 共通形式 {title, year, authors[], venue, cited, link, doi, extra} ----------
const rows = {
  async oa(q, sort, gj) {
    const s = sort === "cited" ? "&sort=cited_by_count:desc" : sort === "new" ? "&sort=publication_date:desc" : "";
    const url = `${URLS.oa}?search=${E(q)}&per-page=4&select=id,doi,display_name,publication_year,cited_by_count,authorships,primary_location${s}`;
    const r = await gj(url);
    return { url, items: ((r && r.results) || []).map(w => ({ title: w.display_name, year: w.publication_year, authors: (w.authorships || []).map(a => a && a.author && a.author.display_name).filter(Boolean), venue: w.primary_location && w.primary_location.source && w.primary_location.source.display_name, cited: w.cited_by_count, link: w.doi || w.id, doi: w.doi })) };
  },
  async cr(q, sort, gj) {
    const s = sort === "cited" ? "&sort=is-referenced-by-count&order=desc" : sort === "new" ? "&sort=published&order=desc" : "";
    const url = `${URLS.cr}?query.bibliographic=${E(q)}&rows=4&select=DOI,title,author,issued,container-title,is-referenced-by-count,URL${s}`;
    const r = await gj(url);
    return { url, items: ((r && r.message && r.message.items) || []).map(m => ({ title: m.title && m.title[0], year: m.issued && m.issued["date-parts"] && m.issued["date-parts"][0] && m.issued["date-parts"][0][0], authors: (m.author || []).map(a => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean), venue: m["container-title"] && m["container-title"][0], cited: m["is-referenced-by-count"], link: m.URL || (m.DOI && "https://doi.org/" + m.DOI), doi: m.DOI && "https://doi.org/" + m.DOI })) };
  },
  async s2(q, sort, gj) {
    const lim = sort ? 12 : 4;
    const url = `${URLS.s2}/search?query=${E(q)}&limit=${lim}&fields=title,year,authors,venue,citationCount,externalIds,url`;
    const r = await gj(url);
    let items = ((r && r.data) || []).map(p => ({ title: p.title, year: p.year, authors: (p.authors || []).map(a => a.name).filter(Boolean), venue: p.venue, cited: p.citationCount, link: (p.externalIds && p.externalIds.DOI) ? "https://doi.org/" + p.externalIds.DOI : p.url, doi: p.externalIds && p.externalIds.DOI && "https://doi.org/" + p.externalIds.DOI, extra: p.externalIds && p.externalIds.ArXiv ? `arXiv:${p.externalIds.ArXiv}` : "" }));
    if (sort === "cited") items.sort((a, b) => (b.cited || 0) - (a.cited || 0)); else if (sort === "new") items.sort((a, b) => (b.year || 0) - (a.year || 0));
    return { url, items: items.slice(0, 4) };
  },
  async inspire(q, sort, gj) {
    const s = sort === "cited" ? "&sort=mostcited" : sort === "new" ? "&sort=mostrecent" : "";
    const url = `${URLS.inspire}?q=${E(q)}&size=3&fields=titles,authors.full_name,citation_count,earliest_date,dois,arxiv_eprints,publication_info${s}`;
    const r = await gj(url);
    return { url, items: ((r && r.hits && r.hits.hits) || []).map(h => { const md = h.metadata || {}; const doi = md.dois && md.dois[0] && md.dois[0].value; return { title: md.titles && md.titles[0] && md.titles[0].title, year: md.earliest_date && md.earliest_date.slice(0, 4), authors: (md.authors || []).map(a => a.full_name).filter(Boolean), venue: md.publication_info && md.publication_info[0] && md.publication_info[0].journal_title, cited: md.citation_count, link: `https://inspirehep.net/literature/${h.id}`, doi: doi && "https://doi.org/" + doi, extra: md.arxiv_eprints && md.arxiv_eprints[0] ? `arXiv:${md.arxiv_eprints[0].value}` : "" }; }) };
  },
  async epmc(q, sort, gj) {
    const url = `${URLS.epmc}?query=${E(q)}&format=json&resultType=lite&pageSize=${sort ? 12 : 4}`;
    const r = await gj(url);
    let items = ((r && r.resultList && r.resultList.result) || []).map(x => ({ title: x.title && x.title.replace(/<[^>]+>/g, ""), year: x.pubYear, authors: x.authorString ? x.authorString.replace(/\.$/, "").split(/,\s*/) : [], venue: x.journalTitle, cited: x.citedByCount, link: `https://europepmc.org/article/${x.source}/${x.id}`, doi: x.doi && "https://doi.org/" + x.doi }));
    if (sort === "cited") items.sort((a, b) => (b.cited || 0) - (a.cited || 0)); else if (sort === "new") items.sort((a, b) => (+b.year || 0) - (+a.year || 0));
    return { url, items: items.slice(0, 4) };
  },
  async books(q, sort, gj) {
    const ja = /[^\x00-\x7F]/.test(q) ? "&langRestrict=ja" : "";
    const url = `${URLS.books}?q=${E(q)}&maxResults=5&printType=books&orderBy=${sort === "new" ? "newest" : "relevance"}${ja}`;
    const r = await gj(url);
    return { url, items: ((r && r.items) || []).map(b => { const v = b.volumeInfo || {}; return { title: v.title + (v.subtitle ? " — " + v.subtitle : ""), year: v.publishedDate && v.publishedDate.slice(0, 4), authors: v.authors || [], venue: v.publisher, cited: null, link: v.infoLink || v.canonicalVolumeLink }; }) };
  },
};

const authorsStr = (a, n = 3) => a && a.length ? a.slice(0, n).join(", ") + (a.length > n ? ` 他${a.length - n}名` : "") : "著者情報なし";
function fmtItem(it, i) {
  const bits = [it.venue || "掲載情報なし"]; if (it.cited !== null && it.cited !== undefined) bits.push(`被引用 ${it.cited}回`);
  return `${i}. ${it.title || "(題名なし)"}（${it.year ?? "年不明"}）\n   著者: ${authorsStr(it.authors)}\n   ${bits.join(" / ")}${it.extra ? " / " + it.extra : ""}\n   ${it.link || ""}`;
}
const normDoi = d => d && d.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");

async function searchAll(it, gj, now) {
  const results = await Promise.allSettled(it.sources.map(s => rows[s](it.q, it.sort, gj)));
  const parts = [], fails = [], seen = {};
  results.forEach((r, i) => {
    const s = it.sources[i];
    if (r.status === "fulfilled" && r.value.items.length) {
      parts.push(`■ ${NAMES[s]}\n${r.value.items.map((x, k) => fmtItem(x, k + 1)).join("\n")}\n   （検索URL: ${r.value.url}）`);
      r.value.items.forEach(x => { const d = normDoi(x.doi); if (d) (seen[d] = seen[d] || { title: x.title, src: new Set() }).src.add(NAMES[s].replace(/（.*/, "")); });
    } else if (r.status === "fulfilled") fails.push(`${NAMES[s].replace(/（.*/, "")}: 該当なし`);
    else fails.push(`${NAMES[s].replace(/（.*/, "")}: 取得できませんでした（${r.reason && r.reason.name === "AbortError" ? "タイムアウト" : r.reason && r.reason.message}）`);
  });
  const multi = Object.entries(seen).filter(([, v]) => v.src.size >= 2);
  const how = it.sort === "cited" ? "被引用数の多い順" : it.sort === "new" ? "新しい順" : "関連度順";
  const head = `「${it.q}」の${it.kind === "books" ? "本" : "文献"}検索（${how}・${it.sources.length}つのデータベース）`;
  if (!parts.length) return `${head}\n\n見つかりませんでした。${fails.length ? "\n" + fails.join("\n") : ""}\n\n他の検索先:\n${links(it.q).map(([n, u]) => `・${n}: ${u}`).join("\n")}`;
  const hint = /[^\x00-\x7F]/.test(it.q) && it.kind !== "books" ? "\n（日本語のキーワードは見つかりにくいことがあります。英語でも試してください）" : "";
  const arx = it.mentionsArxiv ? "\n※arXiv は検索APIを使えないため、上のデータベース経由の結果です。arXiv 内の検索は下のリンクから。" : "";
  return `${head}\n\n${parts.join("\n\n")}${multi.length ? `\n\n複数のデータベースに載っている論文: ${multi.map(([d, v]) => `${v.title}（${[...v.src].join("・")}）`).join(" / ")}` : ""}${fails.length ? `\n\n取得できなかった所: ${fails.join(" / ")}` : ""}${hint}${arx}\n\n他の検索先（自分で開く）:\n${links(it.q).map(([n, u]) => `・${n}: ${u}`).join("\n")}\n\n取得日: ${today(now)}\n※題名・被引用数は各データベースの記載で、内容の正しさを保証するものではありません。`;
}

async function byDoi(it, gj, now) {
  const tries = [
    async () => { const w = await gj(`${URLS.oa}/https://doi.org/${encodeURI(it.doi)}?select=id,doi,display_name,publication_year,cited_by_count,authorships,primary_location`); if (!w || !w.display_name) throw new Error("none"); return ["OpenAlex", { title: w.display_name, year: w.publication_year, authors: (w.authorships || []).map(a => a && a.author && a.author.display_name).filter(Boolean), venue: w.primary_location && w.primary_location.source && w.primary_location.source.display_name, cited: w.cited_by_count, link: w.doi || w.id }, w.id]; },
    async () => { const r = await gj(`${URLS.cr}/${encodeURI(it.doi)}`); const m = r && r.message; if (!m) throw new Error("none"); return ["Crossref", { title: m.title && m.title[0], year: m.issued && m.issued["date-parts"] && m.issued["date-parts"][0] && m.issued["date-parts"][0][0], authors: (m.author || []).map(a => [a.given, a.family].filter(Boolean).join(" ")), venue: m["container-title"] && m["container-title"][0], cited: m["is-referenced-by-count"], link: m.URL || "https://doi.org/" + it.doi }, `${URLS.cr}/${it.doi}`]; },
    async () => { const p = await gj(`${URLS.s2}/DOI:${encodeURI(it.doi)}?fields=title,year,authors,venue,citationCount,externalIds,url`); if (!p || !p.title) throw new Error("none"); return ["Semantic Scholar", { title: p.title, year: p.year, authors: (p.authors || []).map(a => a.name), venue: p.venue, cited: p.citationCount, link: "https://doi.org/" + it.doi }, p.url || URLS.s2]; },
  ];
  for (const f of tries) { try { const [src, item, ref] = await f(); return `DOI ${it.doi} の論文:\n${fmtItem(item, 1).replace(/^1\. /, "")}\n\n出典: ${src} ${ref}\n取得日: ${today(now)}`; } catch (e) { /* 次のデータベースへ */ } }
  return `DOI ${it.doi} は、OpenAlex・Crossref・Semantic Scholar のどれでも見つかりませんでした。DOIの綴りを確認してください。\n直接開く: https://doi.org/${it.doi}`;
}

async function byArxiv(it, gj, now) {
  const abs = `https://arxiv.org/abs/${it.id}`;
  try {
    const p = await gj(`${URLS.s2}/ARXIV:${encodeURI(it.id)}?fields=title,year,authors,venue,citationCount,externalIds,url`);
    if (p && p.title) return `arXiv:${it.id} の論文:\n${fmtItem({ title: p.title, year: p.year, authors: (p.authors || []).map(a => a.name), venue: p.venue || "arXiv", cited: p.citationCount, link: abs }, 1).replace(/^1\. /, "")}\n\n出典: Semantic Scholar ${p.url || URLS.s2}\n取得日: ${today(now)}`;
  } catch (e) { /* リンクだけ返す */ }
  return `arXiv:${it.id} の情報を取得できませんでした。直接開く: ${abs}`;
}

async function run(it, getJSON, now) {
  now = now || new Date();
  if (it.kind === "ask") return "探したい分野やキーワードを入れてください。例:「quantum error correction の論文」「最新のブラックホールの論文」「がんの免疫療法の論文 PubMed で」「相対性理論の本を探して」「arXiv:1706.03762」「10.7717/peerj.4375」\n（英語のキーワードのほうが見つかりやすいです。物理系は INSPIRE、医学系は Europe PMC も同時に検索します）";
  if (it.kind === "doi") return byDoi(it, getJSON, now);
  if (it.kind === "arxiv") return byArxiv(it, getJSON, now);
  return searchAll(it, getJSON, now);
}

const api = { intent, run, links, rows };
if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Papers = api;
})(typeof window !== "undefined" ? window : globalThis);
