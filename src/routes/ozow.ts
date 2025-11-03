import { Router } from "express";
import OzowOrder from "../models/OzowOrder";
import { buildPost, validateResponseHash } from "../utils/ozow";

const router = Router();

// Helper: recompute totals
function computeTotals(items: any[]) {
  const subtotal = (items || []).reduce((t, i) => t + (i.price * i.quantity), 0);
  return { subtotal };
}

// Create Ozow transaction
router.post("/api/ozow/create", async (req, res) => {
  try {
    const { items, subtotal_cents, shipping_cents, total_cents, customer, shipping } = req.body;

    // Validate shipping choice
    const isPickup = shipping?.type === "pickup";
    const expectedShip = isPickup ? 0 : (items?.length ? 20000 : 0);
    if (expectedShip !== +shipping_cents) {
      console.error("Bad shipping:", { expectedShip, shipping_cents, isPickup });
      return res.status(400).json({ error: "BAD_SHIPPING" });
    }

    // Validate address if delivery
    if (!isPickup) {
      const reqd = ["phone", "address1", "city", "province", "postalCode"];
      for (const k of reqd) {
        if (!String(shipping?.[k] || "").trim()) {
          console.error(`Missing ${k}:`, shipping);
          return res.status(400).json({ error: `MISSING_${k.toUpperCase()}` });
        }
      }
    }

    // Recompute totals server-side
    const { subtotal } = computeTotals(items);
    const expectedTotal = subtotal + expectedShip;
    if (subtotal !== +subtotal_cents || expectedTotal !== +total_cents) {
      console.error("Total mismatch:", { subtotal, subtotal_cents, expectedTotal, total_cents });
      return res.status(400).json({ error: "TOTAL_MISMATCH" });
    }

    // Create pending order
    const mRef = `ORD-${Date.now()}`;
    const order = await OzowOrder.create({
      m_payment_id: mRef,
      provider: "ozow",
      status: "pending",
      items,
      subtotal_cents: subtotal,
      shipping_cents: expectedShip,
      total_cents: expectedTotal,
      customer,
      shipping
    });

    console.log(`✓ Ozow order created: ${mRef}, total: R${(expectedTotal / 100).toFixed(2)}`);

    // Build Ozow post
    const post = buildPost({
      amountRands: expectedTotal / 100,
      transactionRef: mRef,
      bankRef: `POOLBAGS-${order._id.toString().slice(-6)}`,
      customerEmail: customer?.email_address,
      optional: { Optional1: String(order._id) }
    });

    return res.json({ ozow: post });
  } catch (e: any) {
    console.error("ozow/create error:", e?.message || e);
    res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// Browser redirect (user returns from Ozow)
router.post("/api/ozow/redirect", async (req, res) => {
  try {
    const r = req.body;
    console.log("Ozow redirect received:", r);

    if (!validateResponseHash(r)) {
      console.error("Invalid hash on redirect");
      return res.redirect(process.env.OZOW_ERROR_URL!);
    }

    const order = await OzowOrder.findOne({ m_payment_id: r.TransactionReference });
    if (order) {
      order.gateway_txn_id = r.TransactionId;
      order.gateway_status = r.Status;
      if (r.Status === "Complete") order.status = "paid";
      if (["Cancelled", "Error", "Abandoned"].includes(r.Status)) order.status = "cancelled";
      await order.save();
      console.log(`✓ Order ${r.TransactionReference} updated: ${r.Status}`);
    }

    if (r.Status === "Complete") return res.redirect(process.env.OZOW_SUCCESS_URL!);
    if (["Cancelled", "Abandoned"].includes(r.Status)) return res.redirect(process.env.OZOW_CANCEL_URL!);
    return res.redirect(process.env.OZOW_ERROR_URL!);
  } catch (e) {
    console.error("Redirect error:", e);
    return res.redirect(process.env.OZOW_ERROR_URL!);
  }
});

// Server-to-server notify (ITN)
router.post("/api/ozow/notify", async (req, res) => {
  try {
    const n = req.body;
    console.log("Ozow notify received:", n);

    if (!validateResponseHash(n)) {
      console.error("Invalid hash on notify");
      return res.status(200).send("OK");
    }

    const order = await OzowOrder.findOne({ m_payment_id: n.TransactionReference });
    if (order) {
      order.gateway_txn_id = n.TransactionId;
      order.gateway_status = n.Status;
      if (n.Status === "Complete") order.status = "paid";
      if (["Cancelled", "Error", "Abandoned"].includes(n.Status)) order.status = "cancelled";
      await order.save();
      console.log(`✓ Notify: Order ${n.TransactionReference} -> ${n.Status}`);
    } else {
      console.warn(`Order not found: ${n.TransactionReference}`);
    }
    return res.status(200).send("OK");
  } catch (e) {
    console.error("Notify error:", e);
    return res.status(200).send("OK");
  }
});

// Optional verify endpoint
router.get("/api/ozow/verify/:ref", async (req, res) => {
  try {
    const site = process.env.OZOW_SITE_CODE!;
    const api = process.env.OZOW_API_KEY!;
    const ref = req.params.ref;
    const url = `https://api.ozow.com/GetTransactionByReference?siteCode=${encodeURIComponent(site)}&transactionReference=${encodeURIComponent(ref)}`;
    
    // Using node-fetch or axios if available
    const fetch = (await import('node-fetch')).default as any;
    const response = await fetch(url, { 
      headers: { ApiKey: api, Accept: "application/json" } 
    });
    const data = await response.json();
    return res.json(data);
  } catch (e: any) {
    console.error("verify error:", e?.message);
    res.status(500).json({ error: "VERIFY_FAILED" });
  }
});

export default router;
