"use client";

import { useEffect, useState, useCallback } from "react";

type PodInfo = {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  node: string | null;
  createdAt: string | null;
};

function statusColor(status: string) {
  if (status === "Running" || status === "Succeeded") return "text-green-600";
  if (status === "Pending" || status === "ContainerCreating") return "text-yellow-600";
  return "text-red-600";
}

export default function PodsPage() {
  const [pods, setPods] = useState<PodInfo[]>([]);
  const [ns, setNs] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/pods");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Error");
      setPods(data.pods);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000); // ৫ সেকেন্ডে auto refresh
    return () => clearInterval(id);
  }, [load]);

  if (loading) return <p className="p-6">লোড হচ্ছে...</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;

  const namespaces = ["all", ...Array.from(new Set(pods.map((p) => p.namespace)))];
  const shown = ns === "all" ? pods : pods.filter((p) => p.namespace === ns);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Pods ({shown.length})</h1>
        <select
          value={ns}
          onChange={(e) => setNs(e.target.value)}
          className="border rounded p-1"
        >
          {namespaces.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <table className="w-full text-left border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Namespace</th>
            <th className="p-2">Name</th>
            <th className="p-2">Ready</th>
            <th className="p-2">Status</th>
            <th className="p-2">Restarts</th>
            <th className="p-2">Node</th>
            <th className="p-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => (
            <tr key={`${p.namespace}/${p.name}`} className="border-t">
              <td className="p-2">{p.namespace}</td>
              <td className="p-2 font-mono">{p.name}</td>
              <td className="p-2">{p.ready}</td>
              <td className={`p-2 font-semibold ${statusColor(p.status)}`}>{p.status}</td>
              <td className="p-2">{p.restarts}</td>
              <td className="p-2">{p.node ?? "-"}</td>
              <td className="p-2">
                {p.createdAt ? new Date(p.createdAt).toLocaleString() : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}