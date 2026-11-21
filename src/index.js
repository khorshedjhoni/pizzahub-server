import "dotenv/config";
import app from "./app.js";
import env from "./config/env.js";

import { connectDB } from "./config/db.js";

async function startServer() {
  try {
    await connectDB();
    app.listen(env.PORT, () => {
      console.log(`PizzaHub server running on port ${env.PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();