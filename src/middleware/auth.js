import { createRemoteJWKSet, jwtVerify } from "jose";
import { ObjectId } from "mongodb";
import env from "../config/env.js";
import { getDb } from "../config/db.js";
import ApiError from "../utils/ApiError.js";

const JWKS = createRemoteJWKSet(new URL(`${env.BETTER_AUTH_URL}/api/auth/jwks`));

export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "Unauthorized: Missing or invalid token");
    }

    const token = authHeader.split(" ")[1];
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: env.BETTER_AUTH_URL,
      audience: env.BETTER_AUTH_URL,
    });

    const db = getDb();
    const userId = payload.sub || payload.id;
    const query = ObjectId.isValid(userId)
      ? { $or: [{ _id: new ObjectId(userId) }, { id: userId }] }
      : { email: payload.email };

    const dbUser = await db.collection("user").findOne(query);
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