"use client";

import { useEffect, useState } from "react";

type NamespaceInfo = { name: string; status: string; createdAt: string | null };

export default function NamespacesPage() {
  const [items, setItems] = useState<NamespaceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/namespaces")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Error");
        setItems(data.namespaces);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-6">লোড হচ্ছে...</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Namespaces</h1>
      <table className="w-full text-left border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Name</th>
            <th className="p-2">Status</th>
            <th className="p-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((ns) => (
            <tr key={ns.name} className="border-t">
              <td className="p-2 font-mono">{ns.name}</td>
              <td className="p-2">{ns.status}</td>
              <td className="p-2">
                {ns.createdAt ? new Date(ns.createdAt).toLocaleString() : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}