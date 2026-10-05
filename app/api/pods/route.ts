import { NextResponse } from "next/server";
import { listPods } from "@/lib/k8s";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pods = await listPods();
    return NextResponse.json({ pods });
  } catch (err) {
    console.error("listPods failed:", err);
    return NextResponse.json(
      { error: "Cluster থেকে pod আনা যায়নি" },
      { status: 500 }
    );
  }
}