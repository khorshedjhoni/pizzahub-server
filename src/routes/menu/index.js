import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../../config/db.js";
import { verifyToken, authorizeRole } from "../../middleware/auth.js";
import ApiError from "../../utils/ApiError.js";
import sendResponse from "../../utils/apiResponse.js";

const router = Router();

// Public: Browse approved & active menu items (search, filter, price sort, featured)
router.get("/", async (req, res, next) => {
  try {
    const db = getDb();
    const {
      search = "",
      category = "",
      location = "",
      sort = "",
      featured = "",
    } = req.query;

    const query = { status: "approved", isAvailable: true };

    if (search.trim()) {
      query.name = { $regex: search.trim(), $options: "i" };
    }
    if (category && category !== "all") {
      query.category = category;
    }
    if (location && location !== "all") {
      query.location = { $regex: location.trim(), $options: "i" };
    }

    // Prioritize Premium vendors first, then sort by price or newest
    const sortStage = { isPremiumVendor: -1 };
    if (sort === "price_asc") sortStage.price = 1;
    else if (sort === "price_desc") sortStage.price = -1;
    else sortStage.createdAt = -1;

    let cursor = db.collection("menuItems").find(query).sort(sortStage);
    if (featured === "true") {
      cursor = cursor.limit(8);
    }

    const items = await cursor.toArray();
    sendResponse(res, { data: items });
  } catch (err) {
    next(err);
  }
});

// Vendor: Get logged-in vendor's own menu items
router.get(
  "/vendor/my-items",
  verifyToken,
  authorizeRole("vendor"),
  async (req, res, next) => {
    try {
      const db = getDb();
      const items = await db
        .collection("menuItems")
        .find({ vendorId: req.user.id })
        .sort({ createdAt: -1 })
        .toArray();

      sendResponse(res, { data: items });
    } catch (err) {
      next(err);
    }
  }
);

// Admin: Get all menu items (pending, approved, rejected)
router.get(
  "/admin/all",
  verifyToken,
  authorizeRole("admin"),
  async (req, res, next) => {
    try {
      const db = getDb();
      const { search = "", status = "" } = req.query;

      const query = {};
      if (status && status !== "all") query.status = status;
      if (search.trim()) {
        query.$or = [
          { name: { $regex: search.trim(), $options: "i" } },
          { vendorName: { $regex: search.trim(), $options: "i" } },
        ];
      }

      const items = await db
        .collection("menuItems")
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      sendResponse(res, { data: items });
    } catch (err) {
      next(err);
    }
  }
);

// Private: Single menu item details (must be logged in)
router.get("/:id", verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid menu item ID");
    }

    const db = getDb();
    const item = await db
      .collection("menuItems")
      .findOne({ _id: new ObjectId(id) });

    if (!item) {
      throw new ApiError(404, "Menu item not found");
    }

    // Customers cannot view unapproved/rejected items via direct URL
    if (
      req.user.role === "customer" &&
      (item.status !== "approved" || !item.isAvailable)
    ) {
      throw new ApiError(404, "Menu item is not available");
    }

    sendResponse(res, { data: item });
  } catch (err) {
    next(err);
  }
});

// Vendor: Create menu item (enforces max 3 active items on Free plan)
router.post("/", verifyToken, authorizeRole("vendor"), async (req, res, next) => {
  try {
    const { name, category, description, price, location, image, images } = req.body;

    if (!name || !category || !description || price === undefined || !location || !image) {
      throw new ApiError(400, "All required fields and image must be provided");
    }

    const db = getDb();
    const isPremium = req.user.subscriptionPlan === "premium";

    if (!isPremium) {
      const activeCount = await db.collection("menuItems").countDocuments({
        vendorId: req.user.id,
        status: { $in: ["pending", "approved"] },
        isAvailable: true,
      });

      if (activeCount >= 3) {
        throw new ApiError(
          403,
          "Free plan allows maximum 3 active menu items. Upgrade to Premium for unlimited items."
        );
      }
    }

    const newItem = {
      vendorId: req.user.id,
      vendorName: req.user.businessName || req.user.name,
      vendorEmail: req.user.email,
      isPremiumVendor: isPremium,
      name: name.trim(),
      category,
      description: description.trim(),
      price: Number(price),
      location: location.trim(),
      image,
      images: Array.isArray(images) && images.length > 0 ? images : [image],
      status: "pending", // Default status until admin approves
      isAvailable: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("menuItems").insertOne(newItem);

    sendResponse(res, {
      statusCode: 201,
      message: "Menu item submitted for admin approval",
      data: { _id: result.insertedId, ...newItem },
    });
  } catch (err) {
    next(err);
  }
});

// Vendor: Update own menu item or toggle availability by
router.patch("/:id", verifyToken, authorizeRole("vendor"), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) throw new ApiError(400, "Invalid menu item ID");

    const db = getDb();
    const existing = await db
      .collection("menuItems")
      .findOne({ _id: new ObjectId(id) });

    if (!existing) throw new ApiError(404, "Menu item not found");
    if (existing.vendorId !== req.user.id) {
      throw new ApiError(403, "Forbidden: You can only edit your own menu items");
    }

    const { name, category, description, price, location, image, isAvailable } = req.body;

    // If re-enabling availability on a Free plan, re-check the 3-item cap
    if (
      isAvailable === true &&
      existing.isAvailable === false &&
      req.user.subscriptionPlan !== "premium"
    ) {
      const activeCount = await db.collection("menuItems").countDocuments({
        vendorId: req.user.id,
        status: { $in: ["pending", "approved"] },
        isAvailable: true,
      });
      if (activeCount >= 3) {
        throw new ApiError(
          403,
          "Free plan limit reached (3 active items). Upgrade to Premium to activate more."
        );
      }
    }

    const updates = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (category !== undefined) updates.category = category;
    if (description !== undefined) updates.description = description.trim();
    if (price !== undefined) updates.price = Number(price);
    if (location !== undefined) updates.location = location.trim();
    if (image !== undefined) {
      updates.image = image;
      updates.images = [image];
    }
    if (isAvailable !== undefined) updates.isAvailable = Boolean(isAvailable);

    await db
      .collection("menuItems")
      .updateOne({ _id: new ObjectId(id) }, { $set: updates });

    sendResponse(res, { message: "Menu item updated" });
  } catch (err) {
    next(err);
  }
});


router.patch(
  "/admin/:id/status",
  verifyToken,
  authorizeRole("admin"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body; 

      if (!ObjectId.isValid(id)) throw new ApiError(400, "Invalid menu item ID");
      if (!["approved", "rejected", "pending"].includes(status)) {
        throw new ApiError(400, "Invalid status value");
      }

      const db = getDb();
      const result = await db
        .collection("menuItems")
        .updateOne(
          { _id: new ObjectId(id) },
          { $set: { status, updatedAt: new Date() } }
        );

      if (result.matchedCount === 0) {
        throw new ApiError(404, "Menu item not found");
      }

      sendResponse(res, { message: `Menu item marked as ${status}` });
    } catch (err) {
      next(err);
    }
  }
);

// Vendor (own item) or Admin (any item): Delete menu item
router.delete(
  "/:id",
  verifyToken,
  authorizeRole("vendor", "admin"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) throw new ApiError(400, "Invalid menu item ID");

      const db = getDb();
      const item = await db
        .collection("menuItems")
        .findOne({ _id: new ObjectId(id) });

      if (!item) throw new ApiError(404, "Menu item not found");

      if (req.user.role === "vendor" && item.vendorId !== req.user.id) {
        throw new ApiError(403, "Forbidden: You can only delete your own items");
      }

      await db.collection("menuItems").deleteOne({ _id: new ObjectId(id) });
      sendResponse(res, { message: "Menu item deleted" });
    } catch (err) {
      next(err);
    }
  }
);

export default router;