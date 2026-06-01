import React, { useMemo, useState } from "react";

/**
 * Demo React app showing a "decision-centric" meeting page.
 *
 * Data source in this demo is REAL (but curated):
 * - Meeting landing page: https://parliament.gg/parliamentary-business/meetings/meeting-17-10-2023
 * - Billet d'État XVII 2023 (PDF): https://parliament.gg/parliamentary-business/billets/billet-xvii-2023
 * - Hansard Volume 12, No. 29 (PDF): https://parliament.gg/parliamentary-business/hansard/hansard-12-29
 * - Proposition pages used for richer metadata where available.
 *
 * Notes:
 * - This is a *demo* UX: it shows how the archive could feel without forcing PDF downloads.
 * - In production, items/amendments/votes/transcript segments would be generated from structured data.
 */
import meetings from "./data/meetings.json";
import items from "./data/itemsfrompages.json";
import highlightsRaw from "./data/highlightsplumbed.jsonl?raw";
import people from "./data/people.json";
import speeches from "./data/speeches.all.json";
import hansardPages from "./data/hansard_pages.all.json";
import votesRaw from "./data/votes.json";

const parsedSpeeches = (highlightsRaw || "")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));


const DATA = {
  meeting: { /* ... */ },
  meetings,
  items,
  speeches,
  hansard: { toc: [], highlights: [] }, // keep empty at module scope
};

function Pill({ tone = "info", children }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : tone === "bad"
      ? "bg-rose-50 text-rose-800 ring-rose-200"
      : tone === "warn"
      ? "bg-amber-50 text-amber-900 ring-amber-200"
      : "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tracking-tight ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  );
}

function OutcomePill({ outcome }) {
  if (!outcome?.status) return null;

  const tone =
    outcome.status === "passed"
      ? "ok"
      : outcome.status === "defeated"
      ? "bad"
      : outcome.status === "withdrawn"
      ? "warn"
      : outcome.status === "not_moved"
      ? "warn"
      : outcome.status === "not_laid"
      ? "warn" 
      : "";

  return <Pill tone={tone}>{outcome.label || outcome.status}</Pill>;
}

function speechSeq(speechId) {
  // sp_m_2023_02_16_00162 -> 162
  if (!speechId) return null;
  const m = String(speechId).match(/(\d+)$/);
  return m ? Number(m[1]) : null;
}

function inSpeechRange(speechId, startSpeechId, endSpeechId) {
  const s = speechSeq(speechId);
  const a = speechSeq(startSpeechId);
  const b = speechSeq(endSpeechId);
  if (s == null || a == null || b == null) return false;
  return s >= a && s <= b;
}

function sortSegments(segments) {
  // stable chronological sort: date, then start_page, then start speech seq
  return (segments || []).slice().sort((x, y) => {
    const d = String(x.meeting_date || "").localeCompare(String(y.meeting_date || ""));
    if (d !== 0) return d;
    const p = (x.start_page ?? 0) - (y.start_page ?? 0);
    if (p !== 0) return p;
    return (speechSeq(x.start_speech_id) ?? 0) - (speechSeq(y.start_speech_id) ?? 0);
  });
}

function isMainItem(it) {
  return !it?.parent_item_key && it?.phase_type === "main";
}

function amendmentNumber(amendmentRef) {
  // "Amdt 14" -> 14
  const m = String(amendmentRef || "").match(/(\d+)/);
  return m ? m[1] : null;
}

function propositionNumber(propRef) {
  // "P.2022/112 Proposition 14A" -> "14A"
  const m = String(propRef || "").match(/Proposition\s+(\d+[A-Z]?)/i);
  return m ? m[1] : null;
}

function primaryLabelForItem(it) {
  if (!it) return "Item";

  if (it.phase_type === "amendment") {
    const n = amendmentNumber(it.amendment_ref);
    return n ? `Amendment ${n}` : "Amendment";
  }

  if (it.phase_type === "proposition_as_amended") {
    const n = propositionNumber(it.proposition_ref);
    // Optional: if your phase_label contains "Option A/B/C" you can surface that
    const opt = String(it.phase_label || "").match(/Option\s+[A-Z]/i)?.[0] || null;
    return `Amended proposition ${n || ""}${opt ? ` (${opt})` : ""}`.trim();
  }

  // fallback for other child types
  return it.phase_label || it.proposition_ref || it.item_key;
}

function dateLabelFromSegments(it) {
  const dates = (it?.segments || [])
    .map((s) => s.meeting_date)
    .filter(Boolean)
    .sort();
  const uniq = Array.from(new Set(dates));
  if (!uniq.length) return null;
  if (uniq.length === 1) return uniq[0];
  return `${uniq[0]} → ${uniq[uniq.length - 1]}`;
}

function ItemCard({ it, meeting, isSelected, onSelect, indent = false, vote }) {
  const outcomeCls = (() => {
    const s = it?.outcome?.status;
    if (s === "passed") return "border-l-4 border-l-emerald-500 bg-emerald-50 ring-1 ring-inset ring-emerald-200";
    if (s === "defeated") return "border-l-4 border-l-rose-500 bg-rose-50 ring-1 ring-inset ring-rose-200";
    if (s === "withdrawn") return "border-l-4 border-l-amber-500 bg-amber-50 ring-1 ring-inset ring-amber-200";
    return "";
  })();

  const isMain = isMainItem(it);
  const dateLabel = isMain
  ? (dateLabelFromSegments(it) || meeting?.meeting_date || null)
  : null;
  const hasNotes = Boolean((it?.notes || "").trim());

  const title = isMain
    ? [it.agenda_item_label, it.phase_label].filter(Boolean).join(" — ")
    : primaryLabelForItem(it);

  // Left-rail description line:
  // - main: existing notes summary
  // - child: show your user-friendly notes (what it does)
  const description = hasNotes ? it.notes.trim() : null;

  return (
    <div
      onClick={onSelect}
      className={`group rounded-2xl border p-4 cursor-pointer transition-all
        ${isSelected
          ? "border-blue-400 bg-blue-50 border-l-4 border-l-blue-500 shadow-sm"
          : outcomeCls || "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"
        }
        ${indent ? "ml-3" : ""}
      `}
    >
      {/* Title */}
      <div className="min-w-0">
        <div className="text-base font-semibold leading-snug text-slate-900">
          {title}
        </div>

        {description ? (
          <div
            className={`mt-2 text-base leading-relaxed text-slate-800 ${
              isSelected ? "" : "line-clamp-4 relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-6 after:bg-gradient-to-t after:from-white"
            }`}
          >
            {description}
          </div>
        ) : null}
      </div>

      {/* Meta row */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {isMain &&
          uniqueSegmentDates(it).map((d) => (
            <Pill key={d}>{formatDateLong(d)}</Pill>
          ))}
        {it.phase_type === "amendment" ? <Pill tone="warn">Amendment</Pill> : null}
        <OutcomePill outcome={it.outcome} />
      </div>

      {/* Links */}
      <div className="mt-2 flex flex-wrap gap-3">
        {it.detail_url ? (
          <ExternalLink href={it.detail_url}>
            {it.phase_type === "amendment" ? "Read this proposed change" : "Read the proposal"}
          </ExternalLink>
        ) : null}
      </div>
    </div>
  );
}

function formatDateLong(d) {
  // expects "YYYY-MM-DD"
  if (!d) return "";
  const [y, m, day] = String(d).split("-").map(Number);
  if (!y || !m || !day) return String(d);

  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function uniqueSegmentDates(it) {
  const dates = (it?.segments || [])
    .map((s) => s.meeting_date)
    .filter(Boolean)
    .sort();
  return Array.from(new Set(dates));
}

function ExternalLink({ href, children }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
    >
      {children}
    </a>
  );
}

function Section({ title, right, children }) {
  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
        </div>
        <div className="min-w-0 max-w-full">{right}</div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

const VOTE_LABEL = {
  pour: "For",
  contre: "Against",
  absent: "Absent",
  ne_vote_pas: "Abstained",
  did_not_vote: "Did not vote",
};

function toArray(x) {
  return Array.isArray(x) ? x : x ? [x] : [];
}

// Pick which division to show on cards/panel.
// Default = first division; you can later switch to "last" if you prefer.
function pickDivision(voteRecord) {
  const divisions = toArray(voteRecord?.divisions);
  return divisions[0] || null;
}

function getCounts(voteRecord) {
  if (!voteRecord) return null;

  // ✅ New schema (your current JSON): voteRecord.tallies
  if (voteRecord.tallies) {
    const t = voteRecord.tallies || {};
    return {
      forN: Number(t.pour || 0),
      againstN: Number(t.contre || 0),
      absentN: Number(t.absent || 0),
      abstainedN: Number(t.ne_vote_pas || 0),
      didNotVoteN: Number(t.did_not_vote || 0),
      label: voteRecord.label || "Vote",
      sourceUrl: voteRecord.source_url || null,
    };
  }

  // ✅ Old schema (earlier suggestion): voteRecord.divisions[].result_summary
  const divisions = Array.isArray(voteRecord.divisions) ? voteRecord.divisions : [];
  const d = divisions[0] || null;
  const r = d?.result_summary || {};

  return {
    forN: Number(r.pour || 0),
    againstN: Number(r.contre || 0),
    absentN: Number(r.absent || 0),
    abstainedN: Number(r.ne_vote_pas || 0),
    didNotVoteN: Number(r.did_not_vote || 0),
    label: d?.label || voteRecord.label || "Vote",
    sourceUrl: voteRecord.source_url || null,
  };
}

function VoteSummary({ vote }) {
  const c = getCounts(vote);
  if (!c) return null;

  const total = c.forN + c.againstN + c.absentN + c.abstainedN + c.didNotVoteN;
  const pct = (n) => total > 0 ? ((n / total) * 100).toFixed(1) : 0;

  const segments = [
    { n: c.forN,        label: "For",          color: "#10b981" },
    { n: c.againstN,    label: "Against",      color: "#f43f5e" },
    { n: c.abstainedN,  label: "Abstained",    color: "#94a3b8" },
    { n: c.absentN,     label: "Absent",       color: "#e2e8f0" },
  ].filter(s => s.n > 0);

  return (
    <div className="mt-3">
      {/* Bar */}
      <div className="flex h-4 w-full overflow-hidden rounded-full">
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${pct(s.n)}%`, backgroundColor: s.color }}
            title={`${s.label}: ${s.n}`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-3">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}: <span className="font-semibold text-slate-900">{s.n}</span>
            <span className="text-slate-400">({pct(s.n)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VoteDetails({ vote }) {
  const c = getCounts(vote);
  if (!c) return null;

  const buckets = vote.by_bucket || {};
  const getNames = (k) => (Array.isArray(buckets[k]) ? buckets[k] : []);

  // Optional: make "Bury, Tina" display as "Tina Bury"
  const prettyName = (raw) => {
    const parts = String(raw || "").split(",");
    if (parts.length === 2) return `${parts[1].trim()} ${parts[0].trim()}`;
    return String(raw || "");
  };

  const sections = [
    { key: "pour", label: "For", tone: "ok" },
    { key: "contre", label: "Against", tone: "bad" },
    { key: "ne_vote_pas", label: "Abstained", tone: "info" },
    { key: "did_not_vote", label: "Did not vote", tone: "info" },
    { key: "absent", label: "Absent", tone: "warn" },
  ].map((s) => ({ ...s, names: getNames(s.key).map(prettyName).filter(Boolean) }));

  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {sections
          .filter((s) => s.names.length > 0)
          .map((s) => (
            <div key={s.key} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">{s.label}</div>
                <Pill tone={s.tone}>{s.names.length}</Pill>
              </div>

              <div className="mt-2 text-sm text-slate-700 leading-relaxed">
                {s.names.join(", ")}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
function normalizeName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.'’]/g, "")
    .trim();
}

// "Bury, Tina" -> "Tina Bury"
function flipCommaName(name) {
  const parts = String(name || "").split(",");
  if (parts.length === 2) return `${parts[1].trim()} ${parts[0].trim()}`;
  return String(name || "").trim();
}

function personNameVariantsFromPeople(people, personId) {
  const p = people.find((x) => x.person_id === personId);
  if (!p) return [];
  const base = [p.name, ...(p.aliases || [])].filter(Boolean);

  // also include "Surname, Firstname" versions for matching against by_bucket strings
  const variants = new Set();
  for (const nm of base) {
    const clean = String(nm).trim();
    variants.add(clean);
    // crude split for "First Last"
    const parts = clean.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const first = parts.slice(0, -1).join(" ");
      variants.add(`${last}, ${first}`);
    }
  }
  return Array.from(variants);
}

function voteRowTitle(it) {
    if (!it) return "Unknown item";

    // Prefer your short description if present
    const short = (it.notes || "").trim();

    // Always keep the formal label too
    const formal = [it.agenda_item_label, it.phase_label].filter(Boolean).join(" — ");

    // If notes exist, lead with them (more scannable)
    return short ? `${short} • ${formal}` : formal;
  }

function getPersonVoteBucket(voteRecord, nameVariants) {
  const buckets = voteRecord?.by_bucket || {};
  const wanted = new Set(nameVariants.map(normalizeName));

  for (const [bucket, names] of Object.entries(buckets)) {
    for (const raw of names || []) {
      const n1 = normalizeName(raw);
      const n2 = normalizeName(flipCommaName(raw));
      if (wanted.has(n1) || wanted.has(n2)) return bucket; // pour/contre/ne_vote_pas/absent/did_not_vote
    }
  }
  return null;
}

function VotePill({ bucket }) {
  if (!bucket) return <Pill>Unknown</Pill>;

  const map = {
    pour: { label: "For", tone: "ok" },
    contre: { label: "Against", tone: "bad" },
    ne_vote_pas: { label: "Abstained", tone: "warn" },
    did_not_vote: { label: "Did not vote", tone: "" },
    absent: { label: "Absent", tone: "warn" },
  };

  const x = map[bucket] || { label: bucket, tone: "" };
  return <Pill tone={x.tone}>{x.label}</Pill>;
}

function DeputyVoteTimeline({
  personId,
  people,
  votesRaw,
  items,
  onSelectItemKey,
}) {
  const [voteQ, setVoteQ] = React.useState("");

  const nameVariants = React.useMemo(
    () => personNameVariantsFromPeople(people, personId),
    [people, personId]
  );

  const rows = React.useMemo(() => {
    if (!nameVariants.length) return [];

    const out = [];
    for (const v of toArray(votesRaw)) {
      const bucket = getPersonVoteBucket(v, nameVariants);
      if (!bucket) continue;

      const it = items.find((x) => x.item_key === v.item_key) || null;
      const title = (() => {
        if (!it) return v.item_key;
        const short = (it.notes || "").trim();
        const formal = [it.proposition_ref || "", it.phase_label || ""].filter(Boolean).join(" — ");
        return short ? `${short} • ${formal}` : formal;
      })();
      out.push({
        vote_id: v.vote_id,
        meeting_date: v.meeting_date,
        item_key: v.item_key,
        phase_label: it?.phase_label || v.item_key,
        agenda_item_label: it?.agenda_item_label || "",
        amendment_ref: it?.amendment_ref || "",
        proposition_ref: it?.proposition_ref || "",
        title: voteRowTitle(it),
        notes: it?.notes || "",
        bucket,
        source_url: v.source_url || null,
      });
    }

    out.sort((a, b) => String(a.meeting_date || "").localeCompare(String(b.meeting_date || "")));
    return out;
  }, [votesRaw, items, nameVariants]);

  const filtered = React.useMemo(() => {
    const needle = voteQ.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const blob = `${r.meeting_date} ${r.title || ""} ${r.notes || ""} ${r.agenda_item_label} ${r.phase_label} ${r.proposition_ref} ${r.amendment_ref}`
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [rows, voteQ]);

  if (!nameVariants.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="text-xs font-semibold text-slate-900">Voting record</div>
        <div className="mt-1 text-sm text-slate-600">
          I can’t match this deputy to votes yet (their name/aliases aren’t in people.json).
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-slate-900">How they voted</div>
        <Pill>{filtered.length} vote{filtered.length !== 1 ? "s" : ""}</Pill>
      </div>

      <input
        value={voteQ}
        onChange={(e) => setVoteQ(e.target.value)}
        placeholder="Search votes (topic, ref, date)…"
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />

      {filtered.length ? (
        <div className="mt-3 pr-2 space-y-2">
          {filtered.map((r) => (
            <div key={r.vote_id} className={`rounded-xl border p-3
              ${r.bucket === "pour" ? "border-l-4 border-l-emerald-500 bg-emerald-50 ring-1 ring-inset ring-emerald-200" :
                r.bucket === "contre" ? "border-l-4 border-l-rose-500 bg-rose-50 ring-1 ring-inset ring-rose-200" :
                r.bucket === "ne_vote_pas" ? "border-l-4 border-l-amber-500 bg-amber-50 ring-1 ring-inset ring-amber-200" :
                r.bucket === "absent" ? "border-l-4 border-l-slate-400 bg-slate-50 ring-1 ring-inset ring-slate-200" :
                "border-slate-200"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-lg px-3 py-1 text-sm font-bold tracking-tight
                  ${r.bucket === "pour" ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" :
                    r.bucket === "contre" ? "bg-rose-100 text-rose-800 ring-1 ring-rose-300" :
                    r.bucket === "ne_vote_pas" ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300" :
                    r.bucket === "absent" ? "bg-slate-100 text-slate-600 ring-1 ring-slate-300" :
                    "bg-slate-100 text-slate-600 ring-1 ring-slate-300"}`}
                >
                  {r.bucket === "pour" ? "✓ For" :
                  r.bucket === "contre" ? "✗ Against" :
                  r.bucket === "ne_vote_pas" ? "~ Abstained" :
                  r.bucket === "absent" ? "Absent" : r.bucket}
                </span>
                <span className="text-xs text-slate-500">{formatDateLong(r.meeting_date)}</span>
                {r.amendment_ref ? <Pill tone="warn">{r.amendment_ref}</Pill> : null}
              </div>

              <div className="mt-1 text-sm font-semibold text-slate-900">
                {r.title || `${r.agenda_item_label ? `${r.agenda_item_label} — ` : ""}${r.phase_label}`}
              </div>

              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onSelectItemKey(r.item_key)}
                  className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
                >
                  Open this topic
                </button>
                {r.source_url ? (
                  <ExternalLink href={r.source_url}>Official voting record</ExternalLink>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-slate-600">No recorded votes found for this deputy (in votes.json).</div>
      )}
    </div>
  );
}
export default function App() {
  const [tab, setTab] = useState("debates");
  const [q, setQ] = useState(""); // IMPORTANT: when deputy selected, this becomes phrase search
  const [personFilter, setPersonFilter] = useState("all");
  const [selectedItemKey, setSelectedItemKey] = useState("p2026_7_main");
  const [evidenceQ, setEvidenceQ] = useState(""); // right-panel search (used only when personFilter === "all")
  const hansardPanelRef = React.useRef(null);
  const [openParents, setOpenParents] = useState({});
  const [evidenceMode, setEvidenceMode] = useState("topic"); // "topic" | "person"
  const [openSpeech, setOpenSpeech] = useState(null);
  const [activeSegmentIdx, setActiveSegmentIdx] = useState(0);
  const [showVoteDetails, setShowVoteDetails] = useState(false);
  const [showIntro, setShowIntro] = useState(() => {
    return localStorage.getItem("guernsey_intro_seen") !== "yes";
  });
  const RELATED_COVERAGE = [
    {
      id: "coverage-1",
      headline: "GST, three initials that dominate a much wider reform designed to protect lower income households",
      url: "https://www.thequarry.media/gst-three-initials-that-dominate/",
      summary: "14 Jan 2026: This summer the States will decide on the biggest shakeup to the tax system in nearly two decades. At the heart of it is how to raise an extra £50m. a year, money needed, it is argued, to fund major building projects at schools, the hospital, the ports and beyond to keep the island functioning... .",
      embedUrl: "", // optional; leave blank if you just want a link
    },
    {
      id: "coverage-2",
      headline: "GST-based tax reform proposals published ahead of June decision",
      url: "https://www.thequarry.media/gst-based-tax-reform-proposals-published-ahead-of-june-decision/",
      summary: "12 Jan 2026: Policy & Resources has published a policy letter outlining proposals for tax reform based around a GST. Work is also continuing on alternative options with a final big picture decision by the States set for June... .",
      embedUrl: "",
    },
    {
      id: "coverage-3",
      headline: "For the first time we have full visibility on corporate tax reform options - they all fall far short of filling the deficit and come with uncertainty",
      url: "https://www.thequarry.media/for-the-first-time-we-have-full-visibility-on-corporate-tax-reform-options-they-all-fall-far-short-of-filling-the-deficit-and-come-with-uncertainty/",
      summary: "26 Jan 2026: Five options for corporate tax reform are being consulted on with the most optimistic said to be capable of raising an extra £18.4m. a year, but it also has a downside risk of actually losing £5.1m. should business react badly... .",
      embedUrl: "",
    },
    {
      id: "coverage-4",
      headline: "Online tax reform calculator to help see the impact proposed reforms could have on your pocket",
      url: "https://www.thequarry.media/online-tax-reform-calculator-to-help-see-the-impact-proposed-reforms-could-have-on-your-pocket/",
      summary: "2 Mar 2026: Policy & Resources Committee has published an online calculator aimed at helping islanders evaluate how tax reforms may affect their personal finances... .",
      embedUrl: "",
    },
    {
      id: "coverage-5",
      headline: "Territorial tax regime will not make it on to P&R’s options for reform",
      url: "https://www.thequarry.media/territorial-tax-regime-will-not-make-it-on-to-p-rs-options-for-reform/",
      summary: "10 Mar 2026: A sub-committee working on options for corporate tax reform has dropped the option for a wholesale shake-up. Moving to a territorial regime had been the favoured option of Deputy Charles Parkinson who is leading the part of the investigation looking at how business should contribute in the future... .",
      embedUrl: "",
    },
    {
      id: "coverage-6",
      headline: "Use our calculator to try and balance Guensey's budget",
      url: "https://deficit-47065826-8b24a.web.app/",
      summary: "Use our Deficit Calculator to see how the £98m. deficit could be filled and how much money you are left for big infrastructure projects... .",
      embedUrl: "",
    },
        {
      id: "coverage-7",
      headline: "Tax reform decision in sight as sub-committee recommends no major changes to corporate regime and pressing on with GST-plus instead",
      url: "https://www.thequarry.media/tax-reform-decision-in-sight-as-sub-committee-recommends-no-major-changes-to-corporate-regime-and-pressing-on-with-gst-plus-instead/",
      summary: "13 May 2026: Sub-committee says fundamental corporate tax reform would present considerable economic risk and cannot deliver sufficient revenues.",
      embedUrl: "",
    },
    {
      id: "coverage-8",
      headline: "Government's revision of social security proposals in GST+ welcomed by Chamber",
      url: "https://www.thequarry.media/governments-revision-of-social-security-proposals-in-gst-welcomed-by-chamber/",
      summary: "21 May 2026: Guernsey Chamber of Commerce welcomes Government's revised approach to social security changes within GST+ package.",
      embedUrl: "",
    },
  ];
  
  const evidenceSectionRef = React.useRef(null);

    // Build a speech_id -> best item_key index using items[].segments
    const speechIdToItemKey = useMemo(() => {
      const m = new Map();

      const allItems = DATA.items || [];
      const allSpeeches = DATA.speeches || [];

      // helper: prefer amendments over mains if both match
      const scoreItem = (it) => {
        let s = 0;
        if (it.phase_type === "amendment") s += 10;
        if (it.parent_item_key) s += 5; // tends to mean "more specific"
        return s;
      };

      for (const sp of allSpeeches) {
        let best = null;
        let bestScore = -Infinity;

        for (const it of allItems) {
          const segs = it.segments || [];
          if (!segs.length) continue;

          const matches = segs.some(
            (seg) =>
              seg.meeting_key === sp.meeting_key &&
              inSpeechRange(sp.speech_id, seg.start_speech_id, seg.end_speech_id)
          );

          if (!matches) continue;

          const sc = scoreItem(it);
          if (sc > bestScore) {
            bestScore = sc;
            best = it.item_key;
          }
        }

        if (best) m.set(sp.speech_id, best);
      }

      return m;
    }, [DATA.items, DATA.speeches]);

      const leftSearchMatchesItem = React.useCallback(
        (a) => {
          const needle = q.trim().toLowerCase();
          if (!needle) return false;

          const blob = [
            a.agenda_item_label,
            a.proposition_ref,
            a.amendment_ref,
            a.phase_label,
            a.phase_type,
            a.notes,
            a.meeting_key,
          ]
            .filter(Boolean)
            .join(" | ")
            .toLowerCase();

          return blob.includes(needle);
        },
        [q]
      );

    const flattenedHighlights = useMemo(() => {
      return parsedSpeeches.flatMap((sp) =>
        (sp.highlights || []).map((h, idx) => ({
          ...h,
          highlight_id: `${sp.speech_id}__${idx}`,
          speech_id: sp.speech_id,
          meeting_key: sp.meeting_key,
          meeting_date: sp.meeting_date,
          speaker_label: sp.speaker_label,
          person_name: sp.person_name,
          evidence_locator: sp.evidence_locator,
          source_url: sp.source_url,
          item_key: speechIdToItemKey.get(sp.speech_id) || null,
        }))
      ).filter((h) => {
        const name = `${h.person_name || ""} ${h.speaker_label || ""}`.toLowerCase();
        return !name.includes("bailiff");
      });
    }, [speechIdToItemKey]);

    const HANSARD = useMemo(
    () => ({ toc: [], highlights: flattenedHighlights }),
    [flattenedHighlights]
  );

  const topics = useMemo(() => [], []);

  // ✅ NEW: When a deputy is selected, force the right panel into "person" mode.
  React.useEffect(() => {
    if (personFilter !== "all") setEvidenceMode("person");
    else setEvidenceMode("topic");
  }, [personFilter]);

  // ✅ NEW: If a deputy is selected, the left search box should NOT hide agenda items.
  const filteredItems = useMemo(() => {
    if (personFilter !== "all") return DATA.items;

    const needle = q.trim().toLowerCase();
    if (!needle) return DATA.items;

    const allItems = DATA.items || [];

    const matchesItem = (a) => {
      const blob = [
        a.agenda_item_label,
        a.proposition_ref,
        a.amendment_ref,
        a.phase_label,
        a.phase_type,
        a.notes,
        a.meeting_key,
      ]
        .filter(Boolean)
        .join(" | ")
        .toLowerCase();

      return blob.includes(needle);
    };

    const matched = allItems.filter(matchesItem);
    const keepKeys = new Set(matched.map((it) => it.item_key));

    // if a child matches, also include its parent main item
    for (const it of matched) {
      if (it.parent_item_key) {
        keepKeys.add(it.parent_item_key);
      }
    }

    return allItems.filter((it) => keepKeys.has(it.item_key));
  }, [q, personFilter]);

  const votesByItemKey = useMemo(() => {
    const m = new Map();
    for (const v of toArray(votesRaw)) {
      if (!v?.item_key) continue;
      // if multiple votes ever exist per item, keep the first (or change later)
      if (!m.has(v.item_key)) m.set(v.item_key, v);
    }
    return m;
  }, [votesRaw]);

  const votesById = useMemo(() => {
    const m = new Map();
    for (const v of toArray(votesRaw)) {
      if (v?.vote_id) m.set(v.vote_id, v);
    }
    return m;
  }, [votesRaw]);

  const itemByKey = useMemo(() => {
    const m = new Map();
    for (const it of DATA.items || []) m.set(it.item_key, it);
    return m;
  }, []);

  const childrenByParent = useMemo(() => {
    const m = new Map();
    for (const it of DATA.items || []) {
      if (!it.parent_item_key) continue;
      if (!m.has(it.parent_item_key)) m.set(it.parent_item_key, []);
      m.get(it.parent_item_key).push(it.item_key);
    }
    return m;
  }, [DATA.items]);

  // For a MAIN debate selection:
// Include the main debate itself and the final propositions,
// but exclude amendment-specific debate segments.

  const scopeItemKeysForSelection = React.useCallback(
    (key) => {
      const selected = DATA.items.find((it) => it.item_key === key);
      if (!selected) return [key];

      // If MAIN selected: include itself + "proposition_as_amended" children only
      if (isMainItem(selected)) {
        const childKeys = childrenByParent.get(key) || [];
        const finalPropKeys = childKeys.filter((ck) => {
          const child = DATA.items.find((it) => it.item_key === ck);
          return child?.phase_type === "proposition_as_amended";
        });

        return [key, ...finalPropKeys];
      }

      // Otherwise just the selected item
      return [key];
    },
    [childrenByParent]
  );

  // Flatten votes into per-deputy rows
const voteRows = useMemo(() => {
  const rows = [];

  for (const vote of toArray(votesRaw)) {
    const it = itemByKey.get(vote.item_key) || null;

    const buckets = vote.by_bucket || {};
    for (const [bucket, names] of Object.entries(buckets)) {
      for (const rawName of names || []) {
        // Convert "Bury, Tina" → "Tina Bury"
        const parts = String(rawName).split(",");
        const displayName =
          parts.length === 2
            ? `${parts[1].trim()} ${parts[0].trim()}`
            : String(rawName || "").trim();

        rows.push({
          vote_id: vote.vote_id,
          meeting_date: vote.meeting_date,
          item_key: vote.item_key,
          person_name: displayName,
          vote: bucket,
          source_url: vote.source_url || null,

          // ✅ title based on notes + formal label
          title: voteRowTitle(it),
          phase_type: it?.phase_type || null,
          amendment_ref: it?.amendment_ref || "",
          proposition_ref: it?.proposition_ref || "",
        });
      }
    }
  }

  return rows;
}, [votesRaw, itemByKey]);

const votesByPerson = useMemo(() => {
  const m = new Map();

  for (const row of voteRows) {
    const key = row.person_name.toLowerCase();
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(row);
  }

  return m;
}, [voteRows]);

  const autoOpenGroups = useMemo(() => {
          const needle = q.trim().toLowerCase();
          if (!needle || personFilter !== "all") return new Set();

          const s = new Set();

          for (const it of DATA.items || []) {
            if (!it.parent_item_key) continue;
            if (!leftSearchMatchesItem(it)) continue;

            if (it.phase_type === "amendment") {
              s.add(`${it.parent_item_key}__amendments`);
            }

            if (it.phase_type === "proposition_as_amended") {
              s.add(`${it.parent_item_key}__props`);
            }
          }

          return s;
        }, [q, personFilter, leftSearchMatchesItem]);


  const groupedItems = useMemo(() => {
    const byParent = new Map();
    const mains = [];

    for (const it of filteredItems) {
      if (!it.parent_item_key) {
        mains.push(it);
        continue;
      }
      if (!byParent.has(it.parent_item_key)) byParent.set(it.parent_item_key, []);
      byParent.get(it.parent_item_key).push(it);
    }

    const getNum = (ref) => {
      if (!ref) return null;
      const m = String(ref).match(/\d+/);
      return m ? Number(m[0]) : null;
    };

      
    const getPropNum = (propRef) => {
      // "P.2022/112 Proposition 14A" -> 14 (and keep A as tie-break)
      const s = String(propRef || "");
      const m = s.match(/Proposition\s+(\d+)/i);
      return m ? Number(m[1]) : null;
    };

    return mains
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((m) => {
        const kids = byParent.get(m.item_key) || [];

        const amendments = kids
          .filter((k) => k.phase_type === "amendment")
          .slice()
          .sort((a, b) => (getNum(a.amendment_ref) ?? 9999) - (getNum(b.amendment_ref) ?? 9999));

        const propsAsAmended = kids
          .filter((k) => k.phase_type === "proposition_as_amended")
          .slice()
          .sort((a, b) => {
            // Prefer explicit sort_order if you’re maintaining it
            const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
            if (so !== 0) return so;

            // fallback: by proposition number
            const pn = (getPropNum(a.proposition_ref) ?? 9999) - (getPropNum(b.proposition_ref) ?? 9999);
            if (pn !== 0) return pn;

            return String(a.proposition_ref || "").localeCompare(String(b.proposition_ref || ""));
          });

        const other = kids.filter(
          (k) => k.phase_type !== "amendment" && k.phase_type !== "proposition_as_amended"
        );

        return { main: m, amendments, propsAsAmended, other };
      });
  }, [filteredItems]);

  const [introStep, setIntroStep] = useState(0);
  const [showAllHighlights, setShowAllHighlights] = useState(false);

  const kpis = useMemo(() => {
    const totalItems = DATA.items.length;
    const totalMeetings = DATA.meetings.length;
    const totalHighlights = flattenedHighlights.length;
    const totalPeople = people.length;
    return { totalItems, totalMeetings, totalHighlights, totalPeople };
  }, []);

    const approvedPropositionsByMeeting = useMemo(() => {
      const rows = (DATA.items || [])
        .filter((it) => it?.phase_type === "proposition_as_amended" || it?.phase_type === "main")
        .filter((it) => it?.outcome?.status === "passed")
        .filter((it) => (it?.notes || "").trim())
        .map((it) => ({
          item_key: it.item_key,
          meeting_key: it.meeting_key,
          meeting_date: uniqueSegmentDates(it)[0] || it.meeting_date || "",
          description: it.notes.trim(),
          label: it.agenda_item_label || it.phase_label || primaryLabelForItem(it),
          proposition_ref: it.proposition_ref || "",
        }))
        .sort((a, b) => String(a.meeting_date).localeCompare(String(b.meeting_date)));

      const grouped = new Map();
      for (const row of rows) {
        if (!grouped.has(row.meeting_key)) {
          grouped.set(row.meeting_key, {
            meeting_key: row.meeting_key,
            meeting_date: row.meeting_date,
            items: [],
          });
        }
        grouped.get(row.meeting_key).items.push(row);
      }

      return Array.from(grouped.values()).sort((a, b) =>
        String(a.meeting_date).localeCompare(String(b.meeting_date))
      );
    }, []);

  function getHansardTextForSpeech(speech) {
    if (!speech) return "";
    const start = Number(speech.start_page);
    const end = Number(speech.end_page ?? speech.start_page);

    if (!Number.isFinite(start) || !Number.isFinite(end)) return speech.text || "";

    const pages = Array.isArray(hansardPages) ? hansardPages : [];

    const scoped = pages.filter((p) => {
      if (p.meeting_key && speech.meeting_key) return p.meeting_key === speech.meeting_key;
      if (p.source_url && speech.source_url) return p.source_url === speech.source_url;
      return true;
    });

    const chunk = scoped
      .filter((p) => Number(p.page) >= start && Number(p.page) <= end)
      .map((p) => p.text)
      .filter(Boolean)
      .join("\n\n");

    return chunk.trim() || speech.text || "";
  }

  function closeIntro() {
    localStorage.setItem("guernsey_intro_seen", "yes");
    setShowIntro(false);
  }

  // ✅ NEW: robust matching between a people.json person_id and speeches speaker_label/person_name.
  function speechMatchesPerson(sp, personId) {
    if (personId === "all") return true;

    const p = people.find((x) => x.person_id === personId);
    if (!p) return false;

    const hay = `${sp.person_name || ""} ${sp.speaker_label || ""}`.toLowerCase();
    const aliases = (p.aliases || []).map((a) => String(a).toLowerCase());
    const fullName = String(p.name || "").toLowerCase();

    if (fullName && hay.includes(fullName)) return true;
    for (const a of aliases) {
      if (a && hay.includes(a)) return true;
    }

    const pidTail = String(personId).split("_").slice(-1)[0];
    if (pidTail && hay.includes(pidTail)) return true;

    return false;
  }
    

  // Build a full-text index per speech_id (uses hansard_pages where possible).
  const speechTextById = useMemo(() => {
    const map = new Map();
    for (const sp of DATA.speeches || []) {
      const txt = getHansardTextForSpeech(sp);
      map.set(sp.speech_id, (txt || sp.text || "").trim());
    }
    return map;
  }, [DATA.speeches, hansardPages]);

  // Limit searchable speeches to the selected item's segments (contextual),
  // AND (when selected) to the selected deputy.
  const speechesForSelectedItem = useMemo(() => {
    const allowedKeys = scopeItemKeysForSelection(selectedItemKey);
    const allowed = new Set(allowedKeys);

    const segs = sortSegments(
      (DATA.items || [])
        .filter((it) => allowed.has(it.item_key))
        .flatMap((it) => it.segments || [])
    );

    if (!segs.length) return [];

    return (DATA.speeches || [])
      .filter((sp) => speechMatchesPerson(sp, personFilter))
      .filter((sp) => {
        const inSeg = segs.some(
          (seg) =>
            sp.meeting_key === seg.meeting_key &&
            inSpeechRange(sp.speech_id, seg.start_speech_id, seg.end_speech_id)
        );
        if (!inSeg) return false;

        const mappedKey = speechIdToItemKey.get(sp.speech_id) || null;

        if (!mappedKey) return true;
        if (allowed.has(mappedKey)) return true;

        // important: keep speeches that are inside this item's segments,
        // even if the single-owner map assigned them to a sibling item
        return segs.some(
          (seg) =>
            sp.meeting_key === seg.meeting_key &&
            inSpeechRange(sp.speech_id, seg.start_speech_id, seg.end_speech_id)
        );
      });
  }, [selectedItemKey, personFilter, DATA.items, DATA.speeches, childrenByParent, speechIdToItemKey]);

  // ✅ NEW: effective Hansard query:
  // - if deputy selected, use LEFT search box (q) as phrase search
  // - else use right panel search box (evidenceQ)
  const hansardNeedle =
    (personFilter !== "all" ? q : evidenceQ).trim().toLowerCase();

  // Full Hansard search results (snippets) for the selected scope.
  const hansardSearchResults = useMemo(() => {
    const needle = hansardNeedle;
    if (!needle) return [];

    const results = [];
    for (const sp of speechesForSelectedItem) {
      const raw = speechTextById.get(sp.speech_id) || "";
      const full = raw.toLowerCase();
      const idx = full.indexOf(needle);
      if (idx === -1) continue;

      const start = Math.max(0, idx - 140);
      const end = Math.min(raw.length, idx + needle.length + 220);
      const snippet = raw.slice(start, end).replace(/\s+/g, " ").trim();

      results.push({ speech: sp, snippet, matchIndex: idx });
    }

    results.sort((a, b) => {
      const d = (a.speech.meeting_date || "").localeCompare(b.speech.meeting_date || "");
      if (d !== 0) return d;
      return (speechSeq(a.speech.speech_id) ?? 0) - (speechSeq(b.speech.speech_id) ?? 0);
    });

    return results.slice(0, 50);
  }, [hansardNeedle, speechesForSelectedItem, speechTextById]);

  React.useEffect(() => {
    const selected = DATA.items.find((it) => it.item_key === selectedItemKey);
    if (!selected?.parent_item_key) return;
    setOpenParents((p) => ({ ...p, [selected.parent_item_key]: true }));
  }, [selectedItemKey]);

  React.useEffect(() => {
  setShowVoteDetails(false);
}, [selectedItemKey]);

  React.useEffect(() => {
  setActiveSegmentIdx(0);
  setShowAllHighlights(false);
}, [selectedItemKey]);

  React.useEffect(() => {
    const itemKeys = new Set((DATA.items || []).map((it) => it.item_key));
    const missing = [];
    for (const v of toArray(votesRaw)) {
      if (v?.item_key && !itemKeys.has(v.item_key)) missing.push(v.item_key);
    }
    if (missing.length) {
      console.warn("Votes reference missing item_key(s):", Array.from(new Set(missing)));
    }
  }, [votesRaw]);

  return (
    <div
      className="min-h-screen text-[16px] sm:text-[17px]"
      style={{ backgroundColor: "#f8fd98" }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
                {/* Header */}
                <div className="rounded-2xl overflow-hidden shadow-sm ring-1 ring-slate-200">
                  {/* Yellow branded top bar */}
                  <div className="bg-[#f8fd98] border-b border-yellow-200 px-5 py-3 flex items-center justify-between">
                    <a href="https://www.thequarry.media" target="_blank" rel="noreferrer">
                      <img
                        src="https://www.thequarry.media/content/images/2025/05/The-Quarry-no-background.png"
                        alt="The Quarry"
                        className="h-16 w-auto"
                      />
                    </a>
                    <span className="text-xs font-medium text-slate-500 tracking-wide uppercase">
                      Policy Tracker
                    </span>
                  </div>

                  {/* Main header content */}
                  <div className="bg-white flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 leading-tight">
                        How debate around GST and corporate tax has evolved
                      </h1>

                      <p className="mt-2 max-w-2xl text-sm sm:text-base leading-relaxed text-slate-500">
                        Debates, proposed changes, statements and votes — showing how positions
                        on GST, corporate tax, social security and savings have changed over time.
                      </p>

                      <div className="mt-3 flex flex-wrap gap-3">
                        <ExternalLink href={DATA.meeting.sourceMeetingUrl}>Official meeting page</ExternalLink>
                        <ExternalLink href={DATA.meeting.billetPdfUrl}>Billet d'État (PDF)</ExternalLink>
                        <ExternalLink href={DATA.meeting.hansardPdfUrl}>Hansard (PDF)</ExternalLink>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setTab("debates")}
                          className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
                            tab === "debates"
                              ? "bg-slate-900 text-white ring-slate-900"
                              : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          Debates
                        </button>
                        <button
                          onClick={() => setTab("coverage")}
                          className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
                            tab === "coverage"
                              ? "bg-slate-900 text-white ring-slate-900"
                              : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          Related coverage
                        </button>
                        <button
                          onClick={() => setTab("approved")}
                          className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
                            tab === "approved"
                              ? "bg-slate-900 text-white ring-slate-900"
                              : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          What was approved
                        </button>
                        <button
                          onClick={() => { setShowIntro(true); setIntroStep(0); }}
                          className="rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                        >
                          How to use this site
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

        {/* KPIs */}
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 flex items-center gap-3">
            <div className="text-xl font-semibold text-slate-900">{kpis.totalMeetings}</div>
            <div className="text-sm text-slate-600">States meetings covered</div>
          </div>

          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 flex items-center gap-3">
            <div className="text-xl font-semibold text-slate-900">{kpis.totalItems}</div>
            <div className="text-sm text-slate-600">Topics debated</div>
          </div>

          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 flex items-center gap-3">
            <div className="text-xl font-semibold text-slate-900">{kpis.totalHighlights}</div>
            <div className="text-sm text-slate-600">Highlights</div>
          </div>

          <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-inset ring-slate-200 flex items-center gap-3">
            <div className="text-xl font-semibold text-slate-900">{kpis.totalPeople}</div>
            <div className="text-sm text-slate-600">Deputies included</div>
          </div>
        </div>

        {/* Main layout */}
        <div className="mt-4 grid gap-4 lg:grid-cols-12 lg:items-start">
          {/* Left: Debates index */}
          <div className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-4 self-start">
            {tab === "debates" && (
              <div className="rounded-2xl bg-slate-50 p-3">
                <Section
                  title="Select Debate"
                  right={
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search topics"
                        className="w-full sm:w-64 min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                  }
                >
                  <div className="max-h-[calc(100vh-14rem)] overflow-y-auto pr-2 space-y-3">
                    {[
                      {
                        label: "February 2026",
                        groups: groupedItems.filter(({ main }) =>
                          ["m_2026_02_25", "m_2026_02_26"].includes(main.meeting_key)
                        ),
                      },
                      {
                        label: "November 2024",
                        groups: groupedItems.filter(({ main }) =>
                          (main.segments || []).some((s) =>
                            ["m_2024_11_05", "m_2024_11_06", "m_2024_11_07", "m_2024_11_08"].includes(s.meeting_key)
                          )
                        ),
                      },
                      {
                        label: "October 2023",
                        groups: groupedItems.filter(({ main }) =>
                          (main.segments || []).some((s) =>
                            ["m_2023_10_17", "m_2023_10_18", "m_2023_10_19", "m_2023_10_20"].includes(s.meeting_key)
                          )
                        ),
                      },
                      {
                        label: "Jan/Feb 2023",
                        groups: groupedItems.filter(({ main }) =>
                          (main.segments || []).some((s) =>
                            [
                              "m_2023_01_25",
                              "m_2023_01_26",
                              "m_2023_01_27",
                              "m_2023_02_15",
                              "m_2023_02_16",
                              "m_2023_02_17",
                            ].includes(s.meeting_key)
                          )
                        ),
                      },
                    ].map(
                      ({ label, groups }) =>
                        groups.length ? (
                          <div key={label} className="space-y-3">
                            <div className="sticky top-0 z-10 rounded-md bg-slate-900 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm">
                              {label}
                            </div>

                            {groups.map(({ main, amendments, propsAsAmended }) => {
                              const mMain = DATA.meetings.find((x) => x.meeting_key === main.meeting_key);

                              return (
                                <div key={main.item_key} className="space-y-2">
                                  <ItemCard
                                    it={main}
                                    meeting={mMain}
                                    vote={votesByItemKey.get(main.item_key) || null}
                                    isSelected={selectedItemKey === main.item_key}
                                    onSelect={() => setSelectedItemKey(main.item_key)}
                                    onViewEvidence={() => {
                                      setSelectedItemKey(main.item_key);
                                      setTimeout(() => {
                                        hansardPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                                      }, 0);
                                    }}
                                  />

                                  {(amendments?.length || propsAsAmended?.length) ? (
                                    <div className="space-y-2">
                                      {amendments?.length ? (
                                        <div className="space-y-2">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const k = `${main.item_key}__amendments`;
                                              setOpenParents((p) => ({ ...p, [k]: !p[k] }));
                                            }}
                                            className="w-full flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200 transition"
                                            title="Show/hide amendments"
                                          >
                                            <span>Amendments</span>
                                            <span className="text-xs text-slate-500">
                                              {(openParents[`${main.item_key}__amendments`] ||
                                                autoOpenGroups.has(`${main.item_key}__amendments`))
                                                ? "▲ Hide"
                                                : "▼ Show"}
                                            </span>
                                          </button>

                                          {(openParents[`${main.item_key}__amendments`] ||
                                            autoOpenGroups.has(`${main.item_key}__amendments`)) ? (
                                            <div className="space-y-2">
                                              {amendments.map((ch) => {
                                                const mCh = DATA.meetings.find((x) => x.meeting_key === ch.meeting_key);
                                                return (
                                                  <ItemCard
                                                    key={ch.item_key}
                                                    it={ch}
                                                    meeting={mCh}
                                                    vote={votesByItemKey.get(ch.item_key) || null}
                                                    isSelected={selectedItemKey === ch.item_key}
                                                    onSelect={() => setSelectedItemKey(ch.item_key)}
                                                    onViewEvidence={() => {
                                                      setSelectedItemKey(ch.item_key);
                                                      setTimeout(() => {
                                                        hansardPanelRef.current?.scrollIntoView({
                                                          behavior: "smooth",
                                                          block: "start",
                                                        });
                                                      }, 0);
                                                    }}
                                                  />
                                                );
                                              })}
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : null}

                                      {propsAsAmended?.length ? (
                                        <div className="space-y-2">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const k = `${main.item_key}__props`;
                                              setOpenParents((p) => ({ ...p, [k]: !p[k] }));
                                            }}
                                            className="w-full flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200 transition"
                                            title="Show/hide votes on amended propositions"
                                          >
                                            <span>Final propositions</span>
                                            <span className="text-xs text-slate-500">
                                              {(openParents[`${main.item_key}__props`] ||
                                                autoOpenGroups.has(`${main.item_key}__props`))
                                                ? "▲ Hide"
                                                : "▼ Show"}
                                            </span>
                                          </button>

                                          {(openParents[`${main.item_key}__props`] ||
                                            autoOpenGroups.has(`${main.item_key}__props`)) ? (
                                            <div className="space-y-2">
                                              {propsAsAmended.map((ch) => {
                                                const mCh = DATA.meetings.find((x) => x.meeting_key === ch.meeting_key);
                                                return (
                                                  <ItemCard
                                                    key={ch.item_key}
                                                    it={ch}
                                                    meeting={mCh}
                                                    vote={votesByItemKey.get(ch.item_key) || null}
                                                    isSelected={selectedItemKey === ch.item_key}
                                                    onSelect={() => setSelectedItemKey(ch.item_key)}
                                                    onViewEvidence={() => {
                                                      setSelectedItemKey(ch.item_key);
                                                      setTimeout(() => {
                                                        hansardPanelRef.current?.scrollIntoView({
                                                          behavior: "smooth",
                                                          block: "start",
                                                        });
                                                      }, 0);
                                                    }}
                                                  />
                                                );
                                              })}
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null
                    )}

                    {!filteredItems.length && personFilter === "all" && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                        No matches. Try a different search.
                      </div>
                    )}
                  </div>
                </Section>
              </div>
            )}
          </div>

          {/* Right: main panel */}
          <div
            ref={hansardPanelRef}
            className="lg:col-span-8 xl:col-span-9 space-y-4 rounded-2xl bg-white p-4 ring-1 ring-slate-300 self-start"
          >
            {tab === "coverage" ? (
              <Section title="Related coverage">
                <div className="space-y-4">
                  {RELATED_COVERAGE.map((story) => (
                    <div
                      key={story.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <a
                        href={story.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-base font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                      >
                        {story.headline}
                      </a>

                      {story.summary ? (
                        <div className="mt-2 text-sm leading-relaxed text-slate-600">
                          {story.summary}
                        </div>
                      ) : null}

                      <div className="mt-3">
                        <a
                          href={story.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
                        >
                          Open article
                        </a>
                      </div>

                      {story.embedUrl ? (
                        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <iframe
                            src={story.embedUrl}
                            title={story.headline}
                            className="h-[560px] w-full"
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Section>
            ) : tab === "approved" ? (
              <Section title="At a glance: what was approved">
                {approvedPropositionsByMeeting.length ? (
                  <div className="space-y-4">
                    {approvedPropositionsByMeeting.map((grp) => (
                      <div
                        key={grp.meeting_key}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {formatDateLong(grp.meeting_date)}
                            </div>
                            <div className="text-xs text-slate-500">{grp.meeting_key}</div>
                          </div>
                          <Pill tone="ok">{grp.items.length} approved</Pill>
                        </div>

                        <div className="mt-3 space-y-3">
                          {grp.items.map((row) => (
                            <div
                              key={row.item_key}
                              className="rounded-xl border border-emerald-200 bg-white p-3"
                            >
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Debate
                              </div>

                              <div className="mt-1 text-sm font-semibold text-slate-900">
                                {row.label}
                              </div>

                              <div className="mt-1 text-xs text-slate-500">
                                {formatDateLong(row.meeting_date)}
                              </div>

                              <div className="mt-3 text-base font-medium leading-relaxed text-slate-900">
                                {row.description}
                              </div>

                              {row.proposition_ref ? (
                                <div className="mt-2 text-sm text-slate-600">
                                  {row.proposition_ref}
                                </div>
                              ) : null}

                              <div className="mt-3 flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedItemKey(row.item_key);
                                    setEvidenceMode("topic");
                                    setTab("debates");
                                    setTimeout(() => {
                                      evidenceSectionRef.current?.scrollIntoView({
                                        behavior: "smooth",
                                        block: "start",
                                      });
                                    }, 0);
                                  }}
                                  className="text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
                                >
                                  Open this topic
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">
                    No approved propositions found.
                  </div>
                )}
              </Section>
            ) : (
              (() => {
              const selectedItem = DATA.items.find((it) => it.item_key === selectedItemKey);
              const selectedMeeting = DATA.meetings.find((m) => m.meeting_key === selectedItem?.meeting_key);
              const parentItem = selectedItem?.parent_item_key
                ? DATA.items.find((it) => it.item_key === selectedItem.parent_item_key)
                : null;
              const voteRecord = votesByItemKey.get(selectedItemKey) || null;
              // ✅ IMPORTANT: right panel "needle" for filtering highlights stays evidenceQ,
              // but Hansard full-text needle is hansardNeedle (q when deputy selected).
              const highlightNeedle = evidenceQ.trim().toLowerCase();

              const highlightMatchesNeedle = (h) => {
                if (!highlightNeedle) return true;

                const tags = Array.isArray(h.topic_tags)
                  ? h.topic_tags.join(" ")
                  : String(h.topic_tags || "");

                const blob = [
                  h.person_name,
                  h.speaker_label,
                  h.meeting_date,
                  h.quote,
                  tags,
                  h.evidence_locator,
                  h.item_key,
                ]
                  .filter(Boolean)
                  .join(" | ")
                  .toLowerCase();

                return blob.includes(highlightNeedle);
              };

              const statementMatchesNeedle = (s) => {
                if (!highlightNeedle) return true;
                const blob = [
                  s.person_name,
                  s.date,
                  s.summary_plain,
                  s.excerpt,
                  s.evidence_locator,
                  s.tags,
                  s.claims,
                ]
                  .filter(Boolean)
                  .join(" | ")
                  .toLowerCase();
                return blob.includes(highlightNeedle);
              };

              const allowedSpeechIds = new Set(speechesForSelectedItem.map((sp) => sp.speech_id));
              const selectedSpeechIds = new Set(
                speechesForSelectedItem.map((sp) => sp.speech_id)
              );
              

              const panelHighlights =
                evidenceMode === "person" && personFilter !== "all"
                  ? flattenedHighlights
                      .filter((h) => speechMatchesPerson(h, personFilter))
                      .filter(highlightMatchesNeedle)
                      .slice()
                      .sort((a, b) => (a.meeting_date || "").localeCompare(b.meeting_date || ""))
                  : flattenedHighlights
                      .filter((h) => allowedSpeechIds.has(h.speech_id))
                      .filter((h) => personFilter === "all" || speechMatchesPerson(h, personFilter))
                      .filter(highlightMatchesNeedle)
                      .slice()
                      .sort((a, b) => {
                        const d = String(a.meeting_date || "").localeCompare(String(b.meeting_date || ""));
                        if (d !== 0) return d;
                        return (speechSeq(a.speech_id) ?? 0) - (speechSeq(b.speech_id) ?? 0);
                      });

              return (
                <>
                  

                  <div ref={evidenceSectionRef}>
                    {selectedItem && (
                      <div className="mb-3 flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
                        <span className="font-medium text-slate-700">
                          {["m_2026_02_25","m_2026_02_26"].includes(selectedItem.meeting_key)
                            ? "February 2026"
                            : ["m_2023_01_25","m_2023_01_26","m_2023_01_27","m_2023_02_15","m_2023_02_16","m_2023_02_17"]
                              .some(k => (selectedItem.segments||[]).some(s=>s.meeting_key===k))
                            ? "Jan/Feb 2023"
                            : ["m_2023_10_17","m_2023_10_18","m_2023_10_19","m_2023_10_20"]
                              .some(k => (selectedItem.segments||[]).some(s=>s.meeting_key===k))
                            ? "October 2023"
                            : "Budget 2025"}
                        </span>
                        <span className="text-slate-300">›</span>
                        {parentItem && (
                          <>
                            <span>{parentItem.agenda_item_label}</span>
                            <span className="text-slate-300">›</span>
                          </>
                        )}
                        <span className="font-medium text-slate-900">
                          {primaryLabelForItem(selectedItem)}
                        </span>
                      </div>
                    )}
                    <Section
                      title={
                        personFilter !== "all"
                          ? (() => {
                              const p = people.find(x => x.person_id === personFilter);
                              return p ? `${p.name} — what they said and how they voted` : "What was said and how they voted";
                            })()
                          : "Speeches & votes"
                      }
                      right={
                        <div className="flex flex-wrap items-center justify-end gap-2 max-w-full">
                          <select
                            value={personFilter}
                            onChange={(e) => setPersonFilter(e.target.value)}
                            className="w-full sm:w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                            title="Filter by deputy"
                          >
                            <option value="all">All people</option>
                            {people.map((p) => (
                              <option key={p.person_id} value={p.person_id}>
                                {p.name}
                              </option>
                            ))}
                          </select>

                          {personFilter !== "all" ? (
                            <div className="flex rounded-xl bg-white ring-1 ring-slate-200 p-1">
                              <button
                                onClick={() => setEvidenceMode("topic")}
                                className={`rounded-lg px-2.5 py-1 text-sm font-medium ${
                                  evidenceMode === "topic"
                                    ? "bg-blue-50 text-blue-800"
                                    : "text-slate-700 hover:bg-slate-50"
                                }`}
                                type="button"
                              >
                                This topic
                              </button>
                              <button
                                onClick={() => setEvidenceMode("person")}
                                className={`rounded-lg px-2.5 py-1 text-sm font-medium ${
                                  evidenceMode === "person"
                                    ? "bg-blue-50 text-blue-800"
                                    : "text-slate-700 hover:bg-slate-50"
                                }`}
                                type="button"
                              >
                                Deputy timeline
                              </button>
                            </div>
                          ) : null}

                          <input
                            value={evidenceQ}
                            onChange={(e) => setEvidenceQ(e.target.value)}
                            placeholder={
                              evidenceMode === "person"
                                ? "Filter highlights / votes…"
                                : "Search this topic (Hansard + highlights)…"
                            }
                            className="w-full sm:w-64 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                          />
                        </div>
                      }
                    >
                      <div className="space-y-3">
                      {/* ✅ Show context + vote only when we're in "This topic" mode */}
                      {evidenceMode === "topic" ? (
                        <>
                          {/* Context box */}
                          <div
                            className={`rounded-2xl border p-3 ${
                              selectedItem?.outcome?.status === "passed"
                                ? "border-l-4 border-l-emerald-500 bg-emerald-50 ring-1 ring-inset ring-emerald-200"
                                : selectedItem?.outcome?.status === "defeated"
                                ? "border-l-4 border-l-rose-500 bg-rose-50 ring-1 ring-inset ring-rose-200"
                                : selectedItem?.outcome?.status === "withdrawn"
                                ? "border-l-4 border-l-amber-500 bg-amber-50 ring-1 ring-inset ring-amber-200"
                                : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            

                            <div className="mt-1 text-sm text-slate-800">
                              {selectedItem ? (
                                <>
                                  {/* Plain-English description */}
                                  {selectedItem.notes ? (
                                    <div className="text-base font-medium text-slate-900 leading-relaxed">
                                      {selectedItem.notes}
                                    </div>
                                  ) : null}

                                  {/* Debate stage */}
                                  <div className="mt-2 text-sm font-semibold text-slate-500">
                                    {parentItem ? (
                                      <>
                                        {parentItem.phase_label}
                                        <span className="mx-1 text-slate-400">→</span>
                                        {selectedItem.phase_label}
                                      </>
                                    ) : (
                                      selectedItem.phase_label || selectedItem.agenda_item_label
                                    )}
                                  </div>
                                  {selectedItem?.outcome?.status && (
                                    <div className="mt-2">
                                      <OutcomePill outcome={selectedItem.outcome} />
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span className="text-slate-600">No item selected</span>
                              )}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-3">
                              <ExternalLink href={selectedMeeting?.meeting_url}>Meeting page</ExternalLink>
                            </div>
                          </div>

                        {/* Vote box (only meaningful for a specific selected topic) */}
                        {voteRecord ? (
                          <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-slate-900">
                                {voteRecord.label || "Recorded vote"}
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setShowVoteDetails((v) => !v)}
                                  type="button"
                                  className="rounded-xl bg-blue-50 text-blue-800 ring-1 ring-blue-200 px-3 py-1.5 text-xs font-semibold hover:bg-blue-100"
                                >
                                  {showVoteDetails ? "Hide who voted" : "Show how they voted"}
                                </button>

                                {voteRecord.source_url ? (
                                  <a
                                    href={voteRecord.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-medium text-slate-500 hover:text-slate-700 hover:underline"
                                  >
                                    Official voting record →
                                  </a>
                                ) : null}
                              </div>
                            </div>

                            <VoteSummary vote={voteRecord} />
                            {showVoteDetails ? <VoteDetails vote={voteRecord} /> : null}
                          </div>
                        ) : null}
                        </>
                      ) : null}

                    {/* ✅ Deputy timeline replaces context+vote when in person mode */}
                    {evidenceMode === "person" && personFilter !== "all" ? (
                      <DeputyVoteTimeline
                        personId={personFilter}
                        people={people}
                        votesRaw={votesRaw}
                        items={DATA.items}
                        onSelectItemKey={(k) => {
                          setSelectedItemKey(k);
                          setEvidenceMode("topic"); // ✅ important: switching back makes context box reappear
                          setTimeout(() => {
                            hansardPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }, 0);
                        }}
                      />
                    ) : null}


                      {/* Full Hansard matches:
                          - query is hansardNeedle (q when deputy selected, evidenceQ otherwise)
                          - speeches are already scoped to deputy (if selected) + selected item segments */}
                      {hansardNeedle ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-semibold text-slate-900">
                              Hansard matches{personFilter !== "all" ? " (selected deputy)" : ""}
                            </div>
                            <Pill>
                              {hansardSearchResults.length} hit{hansardSearchResults.length !== 1 ? "s" : ""}
                            </Pill>
                          </div>

                          {hansardSearchResults.length ? (
                            <div className="mt-2 space-y-2">
                              {hansardSearchResults.map((r) => (
                                <div key={r.speech.speech_id} className="rounded-xl border border-slate-200 p-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-900">
                                      {r.speech.speaker_label}
                                    </span>
                                    <span className="text-xs text-slate-500">{r.speech.meeting_date}</span>
                                    <Pill>Hansard</Pill>
                                  </div>

                                  <div className="mt-2 text-sm text-slate-700">…{r.snippet}…</div>

                                  <a
                                    href={r.speech.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 block text-xs text-slate-500 hover:text-slate-700 hover:underline"
                                  >
                                    {r.speech.evidence_locator} • View in official Hansard
                                  </a>

                                  <button
                                    onClick={() => setOpenSpeech(r.speech)}
                                    className="mt-2 text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
                                  >
                                    Open full speech
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 text-sm text-slate-600">
                              No matches in the full Hansard text for this scope.
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Highlights (curated statements) */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-semibold text-slate-900">Highlights</div>
                            <div className="mt-1 text-xs text-slate-500">
                              These are curated excerpts. Use “Read full speech” or "View in official Hansard" for more context.
                            </div>
                          </div>
                          <Pill>{panelHighlights.length} highlight{panelHighlights.length !== 1 ? "s" : ""}</Pill>
                        </div>

                        {panelHighlights.length > 0 ? (
                          <div className="mt-3 space-y-2">
                          <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-2">
                            {(() => {
                              const seen = new Set();
                              const defaultHighlights = panelHighlights.filter((h) => {
                                const key = (h.person_name || h.speaker_label || "").toLowerCase();
                                if (seen.has(key)) return false;
                                seen.add(key);
                                return true;
                              });
                              return (showAllHighlights ? panelHighlights : defaultHighlights).map((h) => {
                              const it = DATA.items.find((x) => x.item_key === h.item_key);
                              const mtg = DATA.meetings.find((m) => m.meeting_key === it?.meeting_key);

                              const speech = h.speech_id
                                ? DATA.speeches.find((sp) => sp.speech_id === h.speech_id)
                                : null;

                              const tags = Array.isArray(h.topic_tags)
                                ? h.topic_tags
                                : String(h.topic_tags || "")
                                    .split(/[;,]/)
                                    .map((t) => t.trim())
                                    .filter(Boolean);

                              return (
                                <div
                                  key={h.highlight_id}
                                  className="rounded-xl border border-slate-200 p-3"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-900">{h.person_name}</span>
                                    <span className="text-sm text-slate-500">{h.meeting_date}</span>
                                    <Pill>Highlight</Pill>
                                  </div>

                                  {evidenceMode === "person" ? (
                                    <div className="mt-1 text-xs text-slate-500">
                                      {mtg?.meeting_date} • {it?.agenda_item_label} — {it?.phase_label}
                                    </div>
                                  ) : null}

                                  <div className="mt-3 border-l-2 border-slate-200 pl-3 text-lg italic leading-loose text-slate-900">
                                    “{h.quote || ""}”
                                  </div>

                                  <a
                                    href={h.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-3 block text-xs text-slate-500 hover:text-slate-700 hover:underline"
                                  >
                                    {h.evidence_locator} • View in official Hansard
                                  </a>

                                  {speech ? (
                                    <button
                                      onClick={() => setOpenSpeech(speech)}
                                      className="mt-2 text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline"
                                    >
                                      Read full speech
                                    </button>
                                  ) : null}
                                </div>
                              );
                           // REPLACE WITH:
                              });
                            })()}
                          </div>

                          {(() => {
                            const seen = new Set();
                            const defaultCount = panelHighlights.filter((h) => {
                              const key = (h.person_name || h.speaker_label || "").toLowerCase();
                              if (seen.has(key)) return false;
                              seen.add(key);
                              return true;
                            }).length;
                            return !showAllHighlights && panelHighlights.length > defaultCount ? (
                              <button
                                onClick={() => setShowAllHighlights(true)}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Show all {panelHighlights.length} highlights
                              </button>
                            ) : showAllHighlights ? (
                              <button
                                onClick={() => setShowAllHighlights(false)}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                              >
                                Show fewer
                              </button>
                            ) : null;
                          })()}
                          </div>
                        ) : (
                          <div className="mt-3 text-sm text-slate-600">
                            No matching highlights. Try clearing the highlight filter, or switch deputy.
                          </div>
                        )}
                      </div>
                    </div>
                                  
                   </Section>
                  </div>
                    <div className="mt-6 text-xs text-slate-500">
                          This page summarises and links to official States of Guernsey material. It does not replace the official record.
                        </div>

                        {/* ===== FULL SPEECH MODAL ===== */}
                        {openSpeech ? (
                          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                            <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 flex flex-col">
                              {/* Header */}
                              <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-slate-900">Full speech</div>
                                  <div className="mt-1 text-xs text-slate-600">
                                    {openSpeech.person_name} • {openSpeech.meeting_date} • {openSpeech.evidence_locator}
                                  </div>
                                </div>

                                <button
                                  onClick={() => setOpenSpeech(null)}
                                  className="shrink-0 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                                >
                                  Close
                                </button>
                              </div>

                              {/* Body */}
                              <div className="flex-1 overflow-auto px-5 py-4 text-base leading-relaxed text-slate-800 whitespace-pre-wrap">
                                {getHansardTextForSpeech(openSpeech)}
                              </div>

                              {/* Footer */}
                              <div className="border-t px-5 py-3 text-xs text-slate-500">
                                Source: Hansard • {openSpeech.evidence_locator}
                              </div>
                            </div>
                          </div>
                        ) : null}
                </>
              );
            })()
          )}
      </div>
      </div>
    </div>

                        {showIntro ? (
                          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-3 sm:p-6 overflow-y-auto">
                            <div className="w-full max-w-2xl min-h-0 flex flex-col rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
                              
                              {/* Progress bar */}
                              <div className="flex gap-1.5 px-5 pt-4">
                                {[0,1,2,3].map((i) => (
                                  <div
                                    key={i}
                                    className={`h-1.5 flex-1 rounded-full transition-all ${
                                      i <= introStep ? "bg-slate-900" : "bg-slate-200"
                                    }`}
                                  />
                                ))}
                              </div>

                              {/* Content */}
                              <div className="flex-1 px-5 py-5 sm:px-6">

                                {introStep === 0 && (
                                  <div>
                                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">The story</div>
                                    <h2 className="text-xl font-bold text-slate-900">Guernsey faces a funding gap — and it is struggling to agree how to fill it</h2>
                                    <p className="mt-3 text-sm leading-relaxed text-slate-600">
                                      The island needs tens of millions of pounds more each year to fund schools, a new hospital facilities and other infrastructure. The big question is how to raise it — through a new sales tax (GST), changes to how businesses are taxed, spending cuts, or some combination.
                                    </p>

                                    {/* Timeline */}
                                    <div className="mt-5 relative">
                                      <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-slate-200" />
                                      {[
                                        { date: "Jan–Feb 2023", label: "The Tax Review", desc: "Policy & Resources proposed a GST package. The States rejected all major options." },
                                        { date: "Oct 2023", label: "Funding & Investment Plan", desc: "A second attempt to agree a long-term funding strategy. P&R ordered to report back with fresh answers." },
                                        { date: "Nov 2024", label: "Budget 2025", desc: "The debate continued into the annual budget, with more proposals and votes that set the course for a GST package to come forward in 2026." },
                                        { date: "Feb 2026", label: "Tax Reform: Workstream 1", desc: "Deputies agreed the shape of a potential GST — 5% including food — ahead of a final summer vote on whether to implement it. Attempts to scrap GST entirely and to rule out territorial corporate tax both failed." },
                                      ].map((item, i) => (
                                        <div key={i} className="relative pl-8 pb-4 last:pb-0">
                                          <div className="absolute left-1.5 top-1.5 h-3 w-3 rounded-full bg-slate-900 ring-2 ring-white" />
                                          <div className="text-xs font-bold text-slate-500">{item.date}</div>
                                          <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                                          <div className="text-sm text-slate-600">{item.desc}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {introStep === 1 && (
                                  <div>
                                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">How debates work</div>
                                    <h2 className="text-xl font-bold text-slate-900">Debates happen in stages — and a vote at one stage doesn't end it</h2>
                                    <p className="mt-3 text-sm leading-relaxed text-slate-600">
                                      Each debate starts with a main proposition. Deputies can then propose amendments — changes to the original proposal. Each amendment is debated and voted on separately. Finally, the proposition as amended goes to a final vote.
                                    </p>
                                    <div className="mt-4 space-y-2">
                                      {[
                                        { icon: "📋", label: "Main debate", desc: "The original proposal is introduced and debated." },
                                        { icon: "✏️", label: "Amendments", desc: "Deputies propose changes. Each is voted on — it can pass or fail." },
                                        { icon: "🗳️", label: "Final vote", desc: "The proposition, with any accepted amendments, goes to a final vote." },
                                      ].map((item) => (
                                        <div key={item.label} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                                          <span className="text-xl">{item.icon}</span>
                                          <div>
                                            <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                                            <div className="text-sm text-slate-600">{item.desc}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {introStep === 2 && (
                                  <div>
                                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Using the tracker</div>
                                    <h2 className="text-xl font-bold text-slate-900">Pick a debate on the left, explore what was said on the right</h2>
                                    <div className="mt-4 space-y-2">
                                      {[
                                        { icon: "👈", label: "Left panel", desc: "Choose which debate or amendment to look at. Topics are grouped by meeting date." },
                                        { icon: "📰", label: "Right panel", desc: "See the vote result, curated highlights from speeches, and links to the official Hansard." },
                                        { icon: "🔍", label: "Search", desc: "Use the search boxes to find specific topics or keywords in the debate text." },
                                        { icon: "👤", label: "Deputy filter", desc: "Select a States member to see everything they said and how they voted across all three debates." },
                                      ].map((item) => (
                                        <div key={item.label} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                                          <span className="text-xl">{item.icon}</span>
                                          <div>
                                            <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                                            <div className="text-sm text-slate-600">{item.desc}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {introStep === 3 && (
                                  <div>
                                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Good to know</div>
                                    <h2 className="text-xl font-bold text-slate-900">A few things to keep in mind</h2>
                                    <div className="mt-4 space-y-2">
                                      {[
                                        { icon: "🟢", label: "Green = passed", desc: "A green border means the proposition or amendment was approved by the States." },
                                        { icon: "🔴", label: "Red = defeated", desc: "A red border means it was voted down." },
                                        { icon: "✂️", label: "Highlights are curated", desc: "The quotes shown are selected excerpts. Use 'Read full speech' for the complete text." },
                                        { icon: "🔗", label: "Always verify", desc: "Every item links back to the official Hansard and voting record so you can check the source." },
                                      ].map((item) => (
                                        <div key={item.label} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                                          <span className="text-xl">{item.icon}</span>
                                          <div>
                                            <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                                            <div className="text-sm text-slate-600">{item.desc}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              </div>

                              {/* Footer navigation */}
                              <div className="flex items-center justify-between gap-3 border-t px-5 py-4 sm:px-6">
                                <button
                                  onClick={() => setIntroStep((s) => Math.max(0, s - 1))}
                                  className={`rounded-xl px-4 py-2 text-sm font-semibold ring-1 ring-slate-200 ${
                                    introStep === 0 ? "invisible" : "text-slate-700 hover:bg-slate-50"
                                  }`}
                                >
                                  ← Back
                                </button>

                                <button
                                  onClick={closeIntro}
                                  className="text-sm font-medium text-slate-400 hover:text-slate-600"
                                >
                                  Skip intro
                                </button>

                                {introStep < 3 ? (
                                  <button
                                    onClick={() => setIntroStep((s) => s + 1)}
                                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                                  >
                                    Next →
                                  </button>
                                ) : (
                                  <button
                                    onClick={closeIntro}
                                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                                  >
                                    Start exploring →
                                  </button>
                                )}
                              </div>

                            </div>
                          </div>
                        ) : null}

  </div>
  );
}