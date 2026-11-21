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
let connectingPromise = null;

export async function connectDB() {
  if (db) return db;

  if (!connectingPromise) {
    connectingPromise = client
      .connect()
      .then(() => {
        db = client.db(env.DB_NAME);
        console.log(`Connected to MongoDB: ${env.DB_NAME}`);
        return db;
      })
      .catch((err) => {
        connectingPromise = null;
        throw err;
      });
  }

  return connectingPromise;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call connectDB() first.");
  }
  return db;
}