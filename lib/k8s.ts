import * as k8s from "@kubernetes/client-node";

// ---------- Types ----------

export type NamespaceInfo = {
  name: string;
  status: string;
  createdAt: string | null;
};

export type PodInfo = {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  restarts: number;
  node: string | null;
  createdAt: string | null;
};

// ---------- Mock data ----------

const MOCK_NAMESPACES: NamespaceInfo[] = [
  { name: "default", status: "Active", createdAt: "2026-01-10T08:00:00.000Z" },
  { name: "kube-system", status: "Active", createdAt: "2026-01-10T08:00:00.000Z" },
  { name: "kube-public", status: "Active", createdAt: "2026-01-10T08:00:00.000Z" },
  { name: "streampro", status: "Active", createdAt: "2026-03-02T10:30:00.000Z" },
  { name: "monitoring", status: "Active", createdAt: "2026-04-15T14:20:00.000Z" },
  { name: "old-staging", status: "Terminating", createdAt: "2026-02-01T09:00:00.000Z" },
];

const MOCK_PODS: PodInfo[] = [
  { name: "coredns-5d78c9869d-x2k4p", namespace: "kube-system", status: "Running", ready: "1/1", restarts: 0, node: "node-1", createdAt: "2026-01-10T08:05:00.000Z" },
  { name: "traefik-6f9cbd9bd4-m8q7z", namespace: "kube-system", status: "Running", ready: "1/1", restarts: 1, node: "node-1", createdAt: "2026-01-10T08:05:00.000Z" },
  { name: "stream-engine-7c5b8d6f9-abc12", namespace: "streampro", status: "Running", ready: "1/1", restarts: 0, node: "node-1", createdAt: "2026-03-02T10:35:00.000Z" },
  { name: "stream-engine-7c5b8d6f9-def34", namespace: "streampro", status: "Running", ready: "1/1", restarts: 2, node: "node-2", createdAt: "2026-03-02T10:35:00.000Z" },
  { name: "ffmpeg-worker-5f7d9c8b6-qwe56", namespace: "streampro", status: "CrashLoopBackOff", ready: "0/1", restarts: 14, node: "node-2", createdAt: "2026-07-01T12:00:00.000Z" },
  { name: "prometheus-0", namespace: "monitoring", status: "Running", ready: "2/2", restarts: 0, node: "node-1", createdAt: "2026-04-15T14:25:00.000Z" },
  { name: "migrate-job-x9z8w", namespace: "default", status: "Pending", ready: "0/1", restarts: 0, node: null, createdAt: "2026-10-05T06:00:00.000Z" },
];

// ---------- Helpers ----------

const isMock = () => process.env.K8S_MOCK === "true";

function getCoreApi(): k8s.CoreV1Api {
  const kc = new k8s.KubeConfig();
  if (process.env.KUBERNETES_SERVICE_HOST) {
    kc.loadFromCluster(); // cluster-এর ভেতরে চললে
  } else {
    kc.loadFromDefault(); // লোকালে ~/.kube/config
  }
  return kc.makeApiClient(k8s.CoreV1Api);
}

function toISO(ts: Date | string | undefined): string | null {
  return ts ? new Date(ts).toISOString() : null;
}

// ---------- Namespaces ----------

export async function listNamespaces(): Promise<NamespaceInfo[]> {
  if (isMock()) return MOCK_NAMESPACES;

  const api = getCoreApi();
  const res = await api.listNamespace();

  return res.items.map((ns) => ({
    name: ns.metadata?.name ?? "unknown",
    status: ns.status?.phase ?? "Unknown",
    createdAt: toISO(ns.metadata?.creationTimestamp),
  }));
}

// ---------- Pods ----------

export async function listPods(): Promise<PodInfo[]> {
  if (isMock()) return MOCK_PODS;

  const api = getCoreApi();
  const res = await api.listPodForAllNamespaces();

  return res.items.map((pod) => {
    const statuses = pod.status?.containerStatuses ?? [];
    const readyCount = statuses.filter((c) => c.ready).length;
    const total = pod.spec?.containers.length ?? statuses.length;
    const waitingReason = statuses.find((c) => c.state?.waiting?.reason)?.state
      ?.waiting?.reason;

    return {
      name: pod.metadata?.name ?? "unknown",
      namespace: pod.metadata?.namespace ?? "unknown",
      status: waitingReason ?? pod.status?.phase ?? "Unknown",
      ready: `${readyCount}/${total}`,
      restarts: statuses.reduce((sum, c) => sum + c.restartCount, 0),
      node: pod.spec?.nodeName ?? null,
      createdAt: toISO(pod.metadata?.creationTimestamp),
    };
  });
}