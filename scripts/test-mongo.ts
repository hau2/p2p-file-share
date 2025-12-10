import { MongoClient } from "mongodb";

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  console.log("Connected OK!");
  process.exit(0);
})();
