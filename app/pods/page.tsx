"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type PodInfo = {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  node: string | null;
  createdAt: string | null;
};

type Bucket = "running" | "pending" | "failed";
type StatusFilter = "all" | Bucket;
type SortKey = "namespace" | "name" | "status" | "restarts" | "node" | "age";
type SortDir = "asc" | "desc";

const POLL_MS = 5000;
const PAGE_SIZES = [10, 25, 50, 100];
const SORT_KEYS: SortKey[] = ["namespace", "name", "status", "restarts", "node", "age"];
const RANK: Record<Bucket, number> = { failed: 0, pending: 1, running: 2 };

const TONE: Record<Bucket, { badge: string; dot: string; bar: string; text: string }> = {
  running: {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  pending: {
    badge: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/20",
    dot: "bg-amber-500",
    bar: "bg-amber-400",
    text: "text-amber-600 dark:text-amber-400",
  },
  failed: {
    badge: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-400/20",
    dot: "bg-rose-500",
    bar: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
  },
};

function bucketOf(status: string): Bucket {
  if (status === "Running" || status === "Succeeded") return "running";
  if (
    status === "Pending" ||
    status === "ContainerCreating" ||
    status === "PodInitializing" ||
    status === "Terminating" ||
    /^Init:\d+\/\d+$/.test(status)
  )
    return "pending";
  return "failed";
}

const ageMs = (p: PodInfo, now: number) =>
  p.createdAt ? now - Date.parse(p.createdAt) : Number.MAX_SAFE_INTEGER;

function formatAge(createdAt: string | null, now: number) {
  if (!createdAt) return "-";
  const s = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

function compare(a: PodInfo, b: PodInfo, key: SortKey, now: number): number {
  switch (key) {
    case "status":
      return RANK[bucketOf(a.status)] - RANK[bucketOf(b.status)] || a.status.localeCompare(b.status);
    case "restarts":
      return a.restarts - b.restarts;
    case "age":
      return ageMs(a, now) - ageMs(b, now);
    case "node":
      return (a.node ?? "").localeCompare(b.node ?? "");
    case "namespace":
      return a.namespace.localeCompare(b.namespace);
    default:
      return a.name.localeCompare(b.name);
  }
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
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const { label, value, tone = "", dot, hint, active = false, onClick } = props;
  const inner = (
    <>
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </>
  );
  const cls = `px-5 py-4 text-left ${active ? "bg-blue-50/70 dark:bg-blue-500/10" : ""}`;
  if (!onClick) return <div className={cls}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${cls} hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 dark:hover:bg-slate-800/60`}
    >
      {inner}
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

function PodsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [pods, setPods] = useState<PodInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const inflight = useRef(false);

  const q = params.get("q") ?? "";
  const ns = params.get("ns") ?? "all";
  const node = params.get("node") ?? "all";
  const rawStatus = params.get("status");
  const status: StatusFilter =
    rawStatus === "running" || rawStatus === "pending" || rawStatus === "failed" ? rawStatus : "all";
  const rawSort = params.get("sort");
  const sort: SortKey = SORT_KEYS.includes(rawSort as SortKey) ? (rawSort as SortKey) : "status";
  const dir: SortDir = params.get("dir") === "desc" ? "desc" : "asc";
  const rawSize = Number(params.get("size"));
  const size = PAGE_SIZES.includes(rawSize) ? rawSize : 25;
  const page = Math.max(1, Number(params.get("page")) || 1);

  const [qInput, setQInput] = useState(q);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const onSearch = (v: string) => {
    setQInput(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setParams({ q: v }), 300);
  };
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const r = await fetch("/api/pods", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `Request failed (HTTP ${r.status})`);
      setPods(data.pods as PodInfo[]);
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
  const namespaces = useMemo(() => Array.from(new Set(pods.map((p) => p.namespace))).sort(), [pods]);
  const nodes = useMemo(
    () => Array.from(new Set(pods.map((p) => p.node).filter((n): n is string => !!n))).sort(),
    [pods],
  );

  const base = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pods.filter(
      (p) =>
        (ns === "all" || p.namespace === ns) &&
        (node === "all" || p.node === node) &&
        (!needle || `${p.namespace}/${p.name}`.toLowerCase().includes(needle)),
    );
  }, [pods, q, ns, node]);

  const counts = useMemo(() => {
    const c = { total: base.length, running: 0, pending: 0, failed: 0, restarts: 0, restarting: 0 };
    for (const p of base) {
      c[bucketOf(p.status)]++;
      c.restarts += p.restarts;
      if (p.restarts > 0) c.restarting++;
    }
    return c;
  }, [base]);

  const rows = useMemo(() => {
    const list = status === "all" ? base : base.filter((p) => bucketOf(p.status) === status);
    const sign = dir === "asc" ? 1 : -1;
    return [...list].sort(
      (a, b) =>
        sign * compare(a, b, sort, now) ||
        a.namespace.localeCompare(b.namespace) ||
        a.name.localeCompare(b.name),
    );
  }, [base, status, sort, dir, now]);

  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pageCount);
  const start = (cur - 1) * size;
  const visible = rows.slice(start, start + size);
  const filtersActive = !!q || ns !== "all" || node !== "all" || status !== "all";

  const onSort = (k: SortKey) =>
    setParams(sort === k ? { dir: dir === "asc" ? "desc" : "asc" } : { sort: k, dir: "asc" });
  const clearFilters = () => {
    setQInput("");
    setParams({ q: null, ns: null, node: null, status: null });
  };
  const toggle = (s: StatusFilter) => setParams({ status: status === s ? null : s });
  const pct = (n: number) => (counts.total ? (n / counts.total) * 100 : 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Pods</h1>
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
              Could not load pods: {error}.{updatedAt ? " Showing the last successful data." : ""}
            </span>
            <button type="button" onClick={() => void onRefresh()} className="font-medium underline underline-offset-2">
              Retry
            </button>
          </div>
        )}

        <section aria-label="Pod summary" className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 md:grid-cols-5 md:divide-y-0 dark:divide-slate-800">
            <Stat label="All pods" value={counts.total} active={status === "all"} onClick={() => toggle("all")} />
            <Stat label="Running" value={counts.running} dot={TONE.running.dot} tone={TONE.running.text} active={status === "running"} onClick={() => toggle("running")} />
            <Stat label="Pending" value={counts.pending} dot={TONE.pending.dot} tone={TONE.pending.text} active={status === "pending"} onClick={() => toggle("pending")} />
            <Stat label="Failed" value={counts.failed} dot={TONE.failed.dot} tone={TONE.failed.text} active={status === "failed"} onClick={() => toggle("failed")} />
            <Stat label="Restarts" value={counts.restarts} tone={counts.restarts > 0 ? TONE.pending.text : ""} hint={`across ${counts.restarting} ${counts.restarting === 1 ? "pod" : "pods"}`} />
          </div>
          <div className="flex h-1.5 w-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={`${counts.running} running, ${counts.pending} pending, ${counts.failed} failed`}>
            <div className={TONE.running.bar} style={{ width: `${pct(counts.running)}%` }} />
            <div className={TONE.pending.bar} style={{ width: `${pct(counts.pending)}%` }} />
            <div className={TONE.failed.bar} style={{ width: `${pct(counts.failed)}%` }} />
          </div>
        </section>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden>
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
            </svg>
            <input type="search" value={qInput} onChange={(e) => onSearch(e.target.value)} placeholder="Search by name or namespace" aria-label="Search pods" className={`${field} w-72 pl-8`} />
          </div>
          <select value={ns} onChange={(e) => setParams({ ns: e.target.value === "all" ? null : e.target.value })} aria-label="Namespace" className={field}>
            <option value="all">All namespaces</option>
            {namespaces.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <select value={node} onChange={(e) => setParams({ node: e.target.value === "all" ? null : e.target.value })} aria-label="Node" className={field}>
            <option value="all">All nodes</option>
            {nodes.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          {filtersActive && (
            <button type="button" onClick={clearFilters} className={ghostBtn}>
              Clear filters
            </button>
          )}
          <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
            {rows.length} {rows.length === 1 ? "pod" : "pods"}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 shadow-[inset_0_-1px_0_0_theme(colors.slate.200)] dark:bg-slate-900 dark:text-slate-400 dark:shadow-[inset_0_-1px_0_0_theme(colors.slate.800)]">
                <tr>
                  <SortTh label="Name" k="name" sort={sort} dir={dir} onSort={onSort} />
                  <SortTh label="Namespace" k="namespace" sort={sort} dir={dir} onSort={onSort} />
                  <th scope="col" className="px-4 py-2.5 font-medium">Ready</th>
                  <SortTh label="Status" k="status" sort={sort} dir={dir} onSort={onSort} />
                  <SortTh label="Restarts" k="restarts" sort={sort} dir={dir} onSort={onSort} />
                  <SortTh label="Node" k="node" sort={sort} dir={dir} onSort={onSort} />
                  <SortTh label="Age" k="age" sort={sort} dir={dir} onSort={onSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading && pods.length === 0 ? (
                  Array.from({ length: 8 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-slate-100 motion-reduce:animate-none dark:bg-slate-800" />
                      </td>
                    </tr>
                  ))
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center">
                      <p className="font-medium">{filtersActive ? "No pods match these filters" : "No pods found"}</p>
                      <p className="mt-1 text-slate-500 dark:text-slate-400">
                        {filtersActive ? "Try a different search or clear the filters." : "Pods will appear here once they are created."}
                      </p>
                      {filtersActive && (
                        <button type="button" onClick={clearFilters} className={`${ghostBtn} mt-4`}>
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  visible.map((p) => {
                    const b = bucketOf(p.status);
                    const [a, c] = p.ready.split("/").map(Number);
                    const notReady = p.status === "Running" && a < c;
                    return (
                      <tr key={`${p.namespace}/${p.name}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="max-w-[28rem] truncate px-4 py-2.5 font-mono text-[13px]" title={p.name}>{p.name}</td>
                        <td className="px-4 py-2.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{p.namespace}</span>
                        </td>
                        <td className={`px-4 py-2.5 tabular-nums ${notReady ? TONE.pending.text + " font-medium" : ""}`}>{p.ready}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[b].badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${TONE[b].dot}`} />
                            {p.status}
                          </span>
                        </td>
                        <td className={`px-4 py-2.5 tabular-nums ${p.restarts >= 5 ? TONE.failed.text + " font-medium" : p.restarts > 0 ? TONE.pending.text : "text-slate-500 dark:text-slate-400"}`}>{p.restarts}</td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{p.node ?? "-"}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-300" title={p.createdAt ? new Date(p.createdAt).toLocaleString() : undefined}>
                          {formatAge(p.createdAt, now)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-2.5 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
            <span className="tabular-nums">
              {rows.length === 0 ? 0 : start + 1}–{Math.min(start + size, rows.length)} of {rows.length}
            </span>
            <div className="flex items-center gap-2">
              <select value={size} onChange={(e) => setParams({ size: e.target.value === "25" ? null : e.target.value })} aria-label="Rows per page" className={`${field} h-8`}>
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>{s} per page</option>
                ))}
              </select>
              <button type="button" disabled={cur <= 1} onClick={() => setParams({ page: String(cur - 1) })} className={`${ghostBtn} h-8`}>
                Previous
              </button>
              <span className="tabular-nums">{cur} / {pageCount}</span>
              <button type="button" disabled={cur >= pageCount} onClick={() => setParams({ page: String(cur + 1) })} className={`${ghostBtn} h-8`}>
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PodsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading pods...</p>}>
      <PodsView />
    </Suspense>
  );
}