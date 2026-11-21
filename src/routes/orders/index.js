import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../../config/db.js";
import { verifyToken, authorizeRole } from "../../middleware/auth.js";
import ApiError from "../../utils/ApiError.js";
import sendResponse from "../../utils/apiResponse.js";

const router = Router();

// Customer: Place a new order
router.post("/", verifyToken, authorizeRole("customer"), async (req, res, next) => {
  try {
    const { menuItemId, deliveryDate, deliveryAddress, message = "" } = req.body;

    if (!menuItemId || !ObjectId.isValid(menuItemId)) {
      throw new ApiError(400, "Valid menu item ID is required");
    }
    if (!deliveryDate || !deliveryAddress?.trim()) {
      throw new ApiError(400, "Delivery date and delivery address are required");
    }

    const db = getDb();
    const item = await db
      .collection("menuItems")
      .findOne({ _id: new ObjectId(menuItemId) });

    if (!item || item.status !== "approved" || !item.isAvailable) {
      throw new ApiError(400, "This item is not currently available for ordering");
    }

    if (item.vendorId === req.user.id) {
      throw new ApiError(403, "You cannot order your own menu item");
    }

    // Prevent duplicate active orders for the same item and delivery date
    const duplicate = await db.collection("orders").findOne({
      customerId: req.user.id,
      menuItemId: item._id.toString(),
      deliveryDate,
      status: { $in: ["pending", "accepted"] },
    });

    if (duplicate) {
      throw new ApiError(
        409,
        "You already have an active order for this item on the selected delivery date"
      );
    }

    const now = new Date();
    const orderDoc = {
      customerId: req.user.id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      vendorId: item.vendorId,
      vendorName: item.vendorName,
      menuItemId: item._id.toString(),
      itemName: item.name,
      itemImage: item.image,
      price: item.price,
      deliveryDate,
      deliveryAddress: deliveryAddress.trim(),
      message: message.trim(),
      status: "pending",
      timeline: [{ status: "pending", at: now }],
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("orders").insertOne(orderDoc);

    sendResponse(res, {
      statusCode: 201,
      message: "Order placed successfully",
      data: { _id: result.insertedId, ...orderDoc },
    });
  } catch (err) {
    next(err);
  }
});

// Customer: Get own orders
router.get("/my", verifyToken, authorizeRole("customer"), async (req, res, next) => {
  try {
    const db = getDb();
    const orders = await db
      .collection("orders")
      .find({ customerId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    sendResponse(res, { data: orders });
  } catch (err) {
    next(err);
  }
});

// Customer: Cancel own pending order
router.patch(
  "/:id/cancel",
  verifyToken,
  authorizeRole("customer"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) throw new ApiError(400, "Invalid order ID");

      const db = getDb();
      const order = await db
        .collection("orders")
        .findOne({ _id: new ObjectId(id) });

      if (!order) throw new ApiError(404, "Order not found");
      if (order.customerId !== req.user.id) {
        throw new ApiError(403, "Forbidden: You cannot modify another customer's order");
      }
      if (order.status !== "pending") {
        throw new ApiError(
          400,
          `Cannot cancel an order that is already ${order.status}`
        );
      }

      const now = new Date();
      await db.collection("orders").updateOne(
        { _id: new ObjectId(id) },
        {
          $set: { status: "cancelled", updatedAt: now },
          $push: { timeline: { status: "cancelled", at: now } },
        }
      );

      sendResponse(res, { message: "Order cancelled" });
    } catch (err) {
      next(err);
    }
  }
);

// Vendor: Get incoming customer orders
router.get(
  "/vendor",
  verifyToken,
  authorizeRole("vendor"),
  async (req, res, next) => {
    try {
      const db = getDb();
      const orders = await db
        .collection("orders")
        .find({ vendorId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray();

      sendResponse(res, { data: orders });
    } catch (err) {
      next(err);
    }
  }
);

// Vendor: Accept or Reject a pending order (only once)
router.patch(
  "/:id/status",
  verifyToken,
  authorizeRole("vendor"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body; // "accepted" | "rejected"

      if (!ObjectId.isValid(id)) throw new ApiError(400, "Invalid order ID");
      if (!["accepted", "rejected"].includes(status)) {
        throw new ApiError(400, "Status must be 'accepted' or 'rejected'");
      }

      const db = getDb();
      const order = await db
        .collection("orders")
        .findOne({ _id: new ObjectId(id) });

      if (!order) throw new ApiError(404, "Order not found");
      if (order.vendorId !== req.user.id) {
        throw new ApiError(403, "Forbidden: Order belongs to another vendor");
      }
      if (order.status !== "pending") {
        throw new ApiError(
          400,
          `Order has already been ${order.status} and cannot be changed`
        );
      }

      const now = new Date();
      await db.collection("orders").updateOne(
        { _id: new ObjectId(id) },
        {
          $set: { status, updatedAt: now },
          $push: { timeline: { status, at: now } },
        }
      );

      sendResponse(res, { message: `Order ${status}` });
    } catch (err) {
      next(err);
    }
  }
);

export default router;