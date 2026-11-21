import { Router } from "express";
import userRoutes from "./users/index.js";
import menuRoutes from "./menu/index.js";
import orderRoutes from "./orders/index.js";
import paymentRoutes from "./payments/index.js";
import statsRoutes from "./stats/index.js";
import reviewRoutes from "./reviews/index.js";

const router = Router();

router.use("/users", userRoutes);
router.use("/menu", menuRoutes);
router.use("/orders", orderRoutes);
router.use("/payments", paymentRoutes);
router.use("/stats", statsRoutes);
router.use("/reviews", reviewRoutes);

export default router;