import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../../config/db.js";
import { verifyToken, authorizeRole } from "../../middleware/auth.js";
import ApiError from "../../utils/ApiError.js";
import sendResponse from "../../utils/apiResponse.js";

const router = Router();

router.get("/:menuItemId", verifyToken, async (req, res, next) => {
  try {
    const db = getDb();
    const reviews = await db
      .collection("reviews")
      .find({ menuItemId: req.params.menuItemId })
      .sort({ createdAt: -1 })
      .toArray();

    sendResponse(res, { data: reviews });
  } catch (err) {
    next(err);
  }
});

router.post("/", verifyToken, authorizeRole("customer"), async (req, res, next) => {
  try {
    const { menuItemId, rating, comment } = req.body;
    if (!menuItemId || !ObjectId.isValid(menuItemId)) {
      throw new ApiError(400, "Invalid menu item ID");
    }
    const numRating = Number(rating);
    if (!numRating || numRating < 1 || numRating > 5) {
      throw new ApiError(400, "Rating must be between 1 and 5");
    }

    const db = getDb();
    const doc = {
      menuItemId,
      customerId: req.user.id,
      customerName: req.user.name,
      rating: numRating,
      comment: (comment || "").trim(),
      createdAt: new Date(),
    };

    const result = await db.collection("reviews").insertOne(doc);
    sendResponse(res, {
      statusCode: 201,
      message: "Review added",
      data: { _id: result.insertedId, ...doc },
    });
  } catch (err) {
    next(err);
  }
});

export default router;