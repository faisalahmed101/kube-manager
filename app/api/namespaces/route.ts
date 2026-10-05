import { NextResponse } from "next/server";
import { listNamespaces } from "@/lib/k8s";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const namespaces = await listNamespaces();
    return NextResponse.json({ namespaces });
  } catch (err) {
    console.error("listNamespaces failed:", err);
    return NextResponse.json(
      { error: "Cluster থেকে namespace আনা যায়নি" },
      { status: 500 }
    );
  }
}