import { Router } from "express";
import { ObjectId } from "mongodb";
import stripe from "../../config/stripe.js";
import env from "../../config/env.js";
import { getDb } from "../../config/db.js";
import { verifyToken, authorizeRole } from "../../middleware/auth.js";

import { findUserFilter } from "../../utils/userFilter.js";
import ApiError from "../../utils/ApiError.js";
import sendResponse from "../../utils/apiResponse.js";

const router = Router();

// Create Stripe Checkout Session for Premium Plan for vendors
router.post(
  "/checkout-session",
  verifyToken,
  authorizeRole("vendor"),
  async (req, res, next) => {
    try {
      if (req.user.subscriptionPlan === "premium") {
        throw new ApiError(400, "You are already subscribed to the Premium plan");
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: req.user.email,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "PizzaHub Vendor Premium Subscription",
                description:
                  "Unlimited menu items, Premium vendor badge, and featured homepage placement",
              },
              unit_amount: 2900, // $29.00
            },
            quantity: 1,
          },
        ],
        metadata: {
          vendorId: req.user.id,
          vendorName: req.user.businessName || req.user.name,
          vendorEmail: req.user.email,
          plan: "premium",
        },
        success_url: `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.CLIENT_URL}/payment/cancel`,
      });

      sendResponse(res, { data: { url: session.url } });
    } catch (err) {
      next(err);
    }
  }
);

// Exported separately to mount BEFORE express.json() in app.js
export const stripeWebhookHandler = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Stripe webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("Stripe event received:", event.type);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { vendorId, vendorName, vendorEmail, plan } = session.metadata || {};
    console.log("Checkout completed metadata:", { vendorId, vendorEmail, plan });

    if (vendorId) {
      const db = getDb();
      const alreadyRecorded = await db
        .collection("transactions")
        .findOne({ stripeSessionId: session.id });

      if (!alreadyRecorded) {
        const userUpdate = await db.collection("user").updateOne(
          findUserFilter(vendorId),
          {
            $set: {
              subscriptionPlan: plan || "premium",
              updatedAt: new Date(),
            },
          }
        );
        console.log("User update result:", userUpdate);

        const txResult = await db.collection("transactions").insertOne({
  vendorId,
  vendorName: vendorName || "",
  vendorEmail: vendorEmail || session.customer_email || "",
  plan: plan || "premium",
  type: "subscription",
  amount: Number(((session.amount_total ?? 2900) / 100).toFixed(2)),
  currency: session.currency || "usd",
  stripeSessionId: session.id,
  stripeSubscriptionId: session.subscription || null,
  status: session.payment_status === "paid" ? "paid" : "succeeded",
  createdAt: new Date(),
});
console.log("Transaction insert result:", txResult);
        // ... rest of menuItems & transactions updates
      }
      
    }
  }

  res.json({ received: true });
};

// Admin: Read-only transaction history (no PUT/PATCH/DELETE routes exist)
router.get(
  "/transactions",
  verifyToken,
  authorizeRole("admin"),
  async (req, res, next) => {
    try {
      const db = getDb();
      const transactions = await db
        .collection("transactions")
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      sendResponse(res, { data: transactions });
    } catch (err) {
      next(err);
    }
  }
);

export default router;