import { Router } from "express";
import { getDb } from "../../config/db.js";
import { verifyToken } from "../../middleware/auth.js";
import sendResponse from "../../utils/apiResponse.js";

const router = Router();

router.get("/overview", verifyToken, async (req, res, next) => {
  try {
    const db = getDb();
    const { id, role, subscriptionPlan } = req.user;

    if (role === "customer") {
      const [total, pending, accepted, rejected, cancelled] = await Promise.all([
        db.collection("orders").countDocuments({ customerId: id }),
        db.collection("orders").countDocuments({ customerId: id, status: "pending" }),
        db.collection("orders").countDocuments({ customerId: id, status: "accepted" }),
        db.collection("orders").countDocuments({ customerId: id, status: "rejected" }),
        db.collection("orders").countDocuments({ customerId: id, status: "cancelled" }),
      ]);

      return sendResponse(res, {
        data: {
          stats: { total, pending, accepted, rejected, cancelled },
          chart: [
            { name: "Pending", count: pending },
            { name: "Accepted", count: accepted },
            { name: "Rejected", count: rejected },
            { name: "Cancelled", count: cancelled },
          ],
        },
      });
    }

    if (role === "vendor") {
      const [totalMenuItems, activeMenuItems, pendingOrders, acceptedOrders, rejectedOrders] =
        await Promise.all([
          db.collection("menuItems").countDocuments({ vendorId: id }),
          db.collection("menuItems").countDocuments({
            vendorId: id,
            status: "approved",
            isAvailable: true,
          }),
          db.collection("orders").countDocuments({ vendorId: id, status: "pending" }),
          db.collection("orders").countDocuments({ vendorId: id, status: "accepted" }),
          db.collection("orders").countDocuments({ vendorId: id, status: "rejected" }),
        ]);

      return sendResponse(res, {
        data: {
          stats: {
            totalMenuItems,
            activeMenuItems,
            pendingOrders,
            acceptedOrders,
            subscriptionPlan,
          },
          chart: [
            { name: "Pending Orders", count: pendingOrders },
            { name: "Accepted Orders", count: acceptedOrders },
            { name: "Rejected Orders", count: rejectedOrders },
          ],
        },
      });
    }

    if (role === "admin") {
      const [
        totalUsers,
        totalVendors,
        totalCustomers,
        totalMenuItems,
        pendingMenuItems,
        totalTransactions,
      ] = await Promise.all([
        db.collection("user").countDocuments({}),
        db.collection("user").countDocuments({ role: "vendor" }),
        db.collection("user").countDocuments({ role: "customer" }),
        db.collection("menuItems").countDocuments({}),
        db.collection("menuItems").countDocuments({ status: "pending" }),
        db.collection("transactions").countDocuments({}),
      ]);

      return sendResponse(res, {
        data: {
          stats: {
            totalUsers,
            totalVendors,
            totalCustomers,
            totalMenuItems,
            pendingMenuItems,
            totalTransactions,
          },
          chart: [
            { name: "Customers", count: totalCustomers },
            { name: "Vendors", count: totalVendors },
            { name: "Menu Items", count: totalMenuItems },
            { name: "Pending Items", count: pendingMenuItems },
          ],
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;