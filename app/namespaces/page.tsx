"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type NamespaceInfo = { name: string; status: string; createdAt: string | null };

type Tone = "ok" | "warn" | "bad";
type StatusFilter = "all" | Tone;
type SortKey = "name" | "status" | "age";
type SortDir = "asc" | "desc";

const POLL_MS = 10_000;
const RANK: Record<Tone, number> = { bad: 0, warn: 1, ok: 2 };

const TONE: Record<Tone, { badge: string; dot: string; text: string }> = {
  ok: {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  warn: {
    badge: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/20",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  bad: {
    badge: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/20",
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
  },
};

function toneOf(status: string): Tone {
  if (status === "Active") return "ok";
  if (status === "Terminating") return "warn";
  return "bad";
}

function formatAge(createdAt: string | null, now: number) {
  if (!createdAt) return "-";
  const s = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

const field =
  "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
const ghostBtn =
  "h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

function Stat(props: {
  label: string;
  value: number;
  tone?: string;
  dot?: string;
  active?: boolean;
  onClick: () => void;
}) {
  const { label, value, tone = "", dot, active = false, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-5 py-4 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-slate-800/60 ${active ? "bg-blue-50/70 dark:bg-blue-500/10" : ""}`}
    >
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </button>
  );
}

function SortTh(props: {
  label: string;
  k: SortKey;
  sort: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const { label, k, sort, dir, onSort } = props;
  const active = sort === k;
  return (
    <th
      scope="col"
      className="px-4 py-2.5 font-medium"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 ${active ? "text-slate-900 dark:text-slate-100" : ""}`}
      >
        {label}
        <span aria-hidden className={`text-[10px] ${active ? "" : "opacity-0"}`}>
          {dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

export default function NamespacesPage() {
  const [items, setItems] = useState<NamespaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const inflight = useRef(false);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("status");
  const [dir, setDir] = useState<SortDir>("asc");

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const r = await fetch("/api/namespaces", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `Request failed (HTTP ${r.status})`);
      setItems(data.namespaces as NamespaceInfo[]);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const now = updatedAt ?? 0;

  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? items.filter((n) => n.name.toLowerCase().includes(needle)) : items;
  }, [items, q]);

  const counts = useMemo(() => {
    const c = { total: base.length, ok: 0, warn: 0, bad: 0 };
    for (const n of base) c[toneOf(n.status)]++;
    return c;
  }, [base]);

  const rows = useMemo(() => {
    const list = status === "all" ? base : base.filter((n) => toneOf(n.status) === status);
    const sign = dir === "asc" ? 1 : -1;
    const age = (n: NamespaceInfo) => (n.createdAt ? now - Date.parse(n.createdAt) : Number.MAX_SAFE_INTEGER);
    return [...list].sort((a, b) => {
      const primary =
        sort === "status"
          ? RANK[toneOf(a.status)] - RANK[toneOf(b.status)] || a.status.localeCompare(b.status)
          : sort === "age"
            ? age(a) - age(b)
            : a.name.localeCompare(b.name);
      return sign * primary || a.name.localeCompare(b.name);
    });
  }, [base, status, sort, dir, now]);

  const filtersActive = !!q || status !== "all";
  const onSort = (k: SortKey) => {
    if (sort === k) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(k);
      setDir("asc");
    }
  };
  const toggle = (s: StatusFilter) => setStatus(status === s ? "all" : s);
  const clearFilters = () => {
    setQ("");
    setStatus("all");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Namespaces</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="relative flex h-2 w-2">
                {!error && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${error ? "bg-rose-500" : "bg-emerald-500"}`} />
              </span>
              {updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString()}` : "Connecting"}
              <span className="text-slate-400">· refreshes every {POLL_MS / 1000}s</span>
            </p>
          </div>
          <button type="button" onClick={() => void onRefresh()} className={`${ghostBtn} inline-flex items-center gap-2`}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden>
              <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3v4h-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Refresh
          </button>
        </header>

        {error && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <span>
              Could not load namespaces: {error}.{updatedAt ? " Showing the last successful data." : ""}
            </span>
            <button type="button" onClick={() => void onRefresh()} className="font-medium underline underline-offset-2">
              Retry
            </button>
          </div>
        )}

        <section aria-label="Namespace summary" className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 md:grid-cols-4 md:divide-y-0 dark:divide-slate-800">
            <Stat label="All namespaces" value={counts.total} active={status === "all"} onClick={() => toggle("all")} />
            <Stat label="Active" value={counts.ok} dot={TONE.ok.dot} tone={TONE.ok.text} active={status === "ok"} onClick={() => toggle("ok")} />
            <Stat label="Terminating" value={counts.warn} dot={TONE.warn.dot} tone={TONE.warn.text} active={status === "warn"} onClick={() => toggle("warn")} />
            <Stat label="Other" value={counts.bad} dot={TONE.bad.dot} tone={TONE.bad.text} active={status === "bad"} onClick={() => toggle("bad")} />
          </div>
        </section>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden>
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
            </svg>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search namespaces" aria-label="Search namespaces" className={`${field} w-72 pl-8`} />
          </div>
          {filtersActive && (
            <button type="button" onClick={clearFilters} className={ghostBtn}>
              Clear filters
            </button>
          )}
          <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
            {rows.length} {rows.length === 1 ? "namespace" : "namespaces"}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <SortTh label="Name" k="name" sort={sort} dir={dir} onSort={onSort} />
                  <SortTh label="Status" k="status" sort={sort} dir={dir} onSort={onSort} />
                  <SortTh label="Age" k="age" sort={sort} dir={dir} onSort={onSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading && items.length === 0 ? (
                  Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={3} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-slate-100 motion-reduce:animate-none dark:bg-slate-800" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-14 text-center">
                      <p className="font-medium">{filtersActive ? "No namespaces match these filters" : "No namespaces found"}</p>
                      <p className="mt-1 text-slate-500 dark:text-slate-400">
                        {filtersActive ? "Try a different search or clear the filters." : "Namespaces will appear here once they are created."}
                      </p>
                      {filtersActive && (
                        <button type="button" onClick={clearFilters} className={`${ghostBtn} mt-4`}>
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((n) => {
                    const t = toneOf(n.status);
                    return (
                      <tr key={n.name} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-2.5 font-mono text-[13px]">{n.name}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[t].badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${TONE[t].dot}`} />
                            {n.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-300" title={n.createdAt ? new Date(n.createdAt).toLocaleString() : undefined}>
                          {formatAge(n.createdAt, now)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}