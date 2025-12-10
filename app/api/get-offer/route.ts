/* eslint-disable @typescript-eslint/no-explicit-any */
import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const client = await clientPromise;
  const db = client.db("p2pshare");

  const record = await db.collection("offers").findOne({ _id: id as any });

  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ offer: record.offer });
}
