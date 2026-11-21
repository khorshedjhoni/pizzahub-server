import { MongoClient, ServerApiVersion } from "mongodb";
import env from "./env.js";

const globalForDb = globalThis;

if (!globalForDb._pizzahubMongoClient) {
  globalForDb._pizzahubMongoClient = new MongoClient(env.MONGO_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    serverSelectionTimeoutMS: 10000,
  });
}

const client = globalForDb._pizzahubMongoClient;

export async function connectDB() {
  if (!globalForDb._pizzahubDb) {
    if (!globalForDb._pizzahubConnectPromise) {
      globalForDb._pizzahubConnectPromise = client
        .connect()
        .then(() => {
          globalForDb._pizzahubDb = client.db(env.DB_NAME);
          return globalForDb._pizzahubDb;
        })
        .catch((err) => {
          globalForDb._pizzahubConnectPromise = null;
          throw err;
        });
    }
    return globalForDb._pizzahubConnectPromise;
  }
  return globalForDb._pizzahubDb;
}

export function getDb() {
  if (!globalForDb._pizzahubDb) {
    throw new Error("Database not initialized. Call connectDB() first.");
  }
  return globalForDb._pizzahubDb;
}