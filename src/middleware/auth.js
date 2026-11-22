import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import env from "../config/env.js";
import { getDb } from "../config/db.js";
import ApiError from "../utils/ApiError.js";

const authBaseUrl = env.BETTER_AUTH_URL?.replace(/\/$/, "");
const JWKS = createRemoteJWKSet(new URL(`${authBaseUrl}/api/auth/jwks`));

export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "Unauthorized: Missing or invalid token");
    }

    const token = authHeader.split(" ")[1]?.trim();
    if (!token || token === "undefined" || token === "null") {
      throw new ApiError(401, "Unauthorized: Missing or invalid token");
    }

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: authBaseUrl,
      audience: authBaseUrl,
    });
   
    const db = getDb();
    const rawUserId = payload.sub || payload.id;
    const userId = typeof rawUserId === "string" ? rawUserId : String(rawUserId || "");
    const isHexObjectId = /^[a-fA-F0-9]{24}$/.test(userId);

    const conditions = [];
    if (isHexObjectId) {
      conditions.push({ _id: new ObjectId(userId) });
    }
    if (userId) {
      conditions.push({ _id: userId }, { id: userId });
    }
    if (payload.email) {
      conditions.push({ email: payload.email });
    }

    if (conditions.length === 0) {
      throw new ApiError(401, "Unauthorized: Invalid token subject");
    }

    const dbUser = await db.collection("user").findOne({ $or: conditions });
    if (!dbUser) {
      throw new ApiError(401, "Unauthorized: User not found");
    }

    if (dbUser.isBlocked) {
      throw new ApiError(403, "Forbidden: Your account has been blocked by admin");
    }

    req.user = {
      id: dbUser._id.toString(),
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role || "customer",
      subscriptionPlan: dbUser.subscriptionPlan || "free",
      businessName: dbUser.businessName || "",
      isBlocked: Boolean(dbUser.isBlocked),
    };

    next();
  } catch (err) {
    console.error("verifyToken failed:", err?.code || err?.name, err?.message);
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, "Unauthorized: Invalid or expired token"));
  }
};

export const authorizeRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, "Forbidden: Insufficient permissions"));
    }
    next();
  };
};