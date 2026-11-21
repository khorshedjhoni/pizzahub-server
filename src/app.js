import express from "express";
import cors from "cors";
import env from "./config/env.js";
import routes from "./routes/index.js";
import { stripeWebhookHandler } from "./routes/payments/index.js";
import notFound from "./middleware/notFound.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

app.use(
  cors({
    origin: [env.CLIENT_URL, "http://localhost:3000"],
    credentials: true,
  })
);

// Stripe webhook MUST receive raw body BEFORE express.json()
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ success: true, message: "PizzaHub API is running" });
});

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

export default app;