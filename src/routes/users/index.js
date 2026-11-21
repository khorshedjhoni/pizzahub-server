import { Router } from "express";
import { ObjectId } from "mongodb";
import { getDb } from "../../config/db.js";
import { verifyToken, authorizeRole } from "../../middleware/auth.js";
import ApiError from "../../utils/ApiError.js";
import sendResponse from "../../utils/apiResponse.js";

const router = Router();

// Get current logged-in user profile
router.get("/me", verifyToken, async (req, res, next) => {
  try {
    const db = getDb();
    const user = await db
      .collection("user")
      .findOne({ _id: new ObjectId(req.user.id) });

    sendResponse(res, { data: user });
  } catch (err) {
    next(err);
  }
});

// Update current user profile (cannot self-change role or subscriptionPlan here)
router.patch("/me", verifyToken, async (req, res, next) => {
  try {
    const db = getDb();
   const { name, image, businessName, location, phone, bio } = req.body;

const updateFields = { updatedAt: new Date() };
if (name !== undefined) updateFields.name = name;
if (image !== undefined) updateFields.image = image;
if (businessName !== undefined) updateFields.businessName = businessName;
if (location !== undefined) updateFields.location = location;
if (phone !== undefined) updateFields.phone = phone;
if (bio !== undefined) updateFields.bio = bio;
    await db
      .collection("user")
      .updateOne({ _id: new ObjectId(req.user.id) }, { $set: updateFields });

    const updated = await db
      .collection("user")
      .findOne({ _id: new ObjectId(req.user.id) });

    sendResponse(res, { message: "Profile updated", data: updated });
  } catch (err) {
    next(err);
  }
});

// Admin: Get all users with search & role filter
router.get("/", verifyToken, authorizeRole("admin"), async (req, res, next) => {
  try {
    const db = getDb();
    const { search = "", role = "" } = req.query;

    const query = {};
    if (role && role !== "all") {
      query.role = role;
    }
    if (search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { email: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const users = await db
      .collection("user")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    sendResponse(res, { data: users });
  } catch (err) {
    next(err);
  }
});


// Admin: Update a user's role (customer / vendor / admin)
router.patch(
  "/:id/role",
  verifyToken,
  authorizeRole("admin"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { role } = req.body;
      const allowedRoles = ["customer", "vendor", "admin"];

      if (!ObjectId.isValid(id)) {
        throw new ApiError(400, "Invalid user ID");
      }

      if (!allowedRoles.includes(role)) {
        throw new ApiError(400, "Invalid role specified");
      }

      const db = getDb();
      const target = await db
        .collection("user")
        .findOne({ _id: new ObjectId(id) });

      if (!target) {
        throw new ApiError(404, "User not found");
      }

      await db.collection("user").updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            role,
            updatedAt: new Date(),
          },
        }
      );

      sendResponse(res, {
        message: "User role updated",
        data: { id, role },
      });
    } catch (err) {
      next(err);
    }
  }
);

// Admin (Optional): Block or unblock a user
router.patch(
  "/:id/block",
  verifyToken,
  authorizeRole("admin"),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) throw new ApiError(400, "Invalid user ID");
      if (id === req.user.id) {
        throw new ApiError(400, "You cannot block your own admin account");
      }

      const db = getDb();
      const target = await db
        .collection("user")
        .findOne({ _id: new ObjectId(id) });
      if (!target) throw new ApiError(404, "User not found");

      const nextBlocked = !target.isBlocked;
      await db
        .collection("user")
        .updateOne(
          { _id: new ObjectId(id) },
          { $set: { isBlocked: nextBlocked, updatedAt: new Date() } }
        );

      sendResponse(res, {
        message: nextBlocked ? "User blocked" : "User unblocked",
        data: { isBlocked: nextBlocked },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;