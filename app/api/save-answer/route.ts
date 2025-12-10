import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongo";

export async function POST(req: Request) {
  try {
    const { id, answer } = await req.json();

    const client = await clientPromise;
    const db = client.db("p2pshare");

    await db.collection("answers").updateOne(
      { _id: id },
      { $set: { answer } },
      { upsert: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err }, { status: 500 });
  }
}
