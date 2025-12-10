/* eslint-disable @typescript-eslint/no-explicit-any */
import clientPromise from "@/lib/mongo";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  const { offer } = await req.json();
  const id = randomUUID();

  const client = await clientPromise;
  const db = client.db("p2pshare");
  await db.collection("offers").insertOne({
    _id: id as any,
    offer,
    createdAt: new Date(),
  });

  return NextResponse.json({ offerId: id });
}
