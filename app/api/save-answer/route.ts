import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { id, answer } = await req.json();

  if (!id || !answer) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const client = await clientPromise;
  const db = client.db("p2pshare");

  await db.collection("answers").insertOne({
    _id: id,
    answer,
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
