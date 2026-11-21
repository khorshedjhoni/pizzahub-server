import { MongoClient, ServerApiVersion } from "mongodb";
import env from "./env.js";

const client = new MongoClient(env.MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;

export async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db(env.DB_NAME);
    console.log(`Connected to MongoDB: ${env.DB_NAME}`);
  }
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call connectDB() first.");
  }
  return db;
}