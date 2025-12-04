import { Router, Request, Response } from "express";
import { buildPost, validateSignature } from "../utils/payfast";
import { PayfastOrder, IPayfastOrder } from "../models/PayfastOrder";

const router = Router();

/**
 * POST /api/payfast/create
 * Create a PayFast payment request
 */
router.post("/create", async (req: Request, res: Response) => {
  try {
    const { items, subtotal, shipping, discount = 0, total, shippingInfo, customer } = req.body;

    // Generate unique payment ID
    const paymentId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    // Create order in database
    const order = new PayfastOrder({
      m_payment_id: paymentId,
      provider: "payfast",
      status: "pending",
      items: items || [],
      subtotal_cents: subtotal || 0,
      shipping_cents: shipping || 0,
      discount_cents: discount,
      total_cents: total || 0,
      shipping: shippingInfo || {},
      customer: customer || {},
    });

    await order.save();

    // Build PayFast payment post
    const itemName = items && items.length > 0 
      ? `${items.length} item${items.length > 1 ? 's' : ''} from Pool Beanbags`
      : "Pool Beanbags Order";

    const itemDescription = items && items.length > 0
      ? items.map((i: any) => `${i.quantity}x ${i.title}`).join(", ")
      : undefined;

    const post = buildPost({
      amountRands: (total || 0) / 100,
      paymentId,
      itemName,
      itemDescription,
      customerEmail: customer?.email_address,
      customerFirstName: customer?.first_name,
      customerLastName: customer?.last_name,
      custom: {
        str1: order._id.toString(), // Store MongoDB order ID
      },
    });

    console.log("[PAYFAST CREATE]", {
      paymentId,
      orderId: order._id.toString(),
      totalRands: (total || 0) / 100,
      itemCount: items?.length || 0,
    });

    res.json({ success: true, post });
  } catch (error: any) {
    console.error("[PAYFAST CREATE ERROR]", error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "Failed to create PayFast payment" 
    });
  }
});

/**
 * POST /api/payfast/itn
 * PayFast Instant Transaction Notification (ITN) webhook
 */
router.post("/itn", async (req: Request, res: Response) => {
  try {
    console.log("[PAYFAST ITN] Received notification:", req.body);

    const {
      m_payment_id,
      pf_payment_id,
      payment_status,
      item_name,
      item_description,
      amount_gross,
      amount_fee,
      amount_net,
      custom_str1,
      name_first,
      name_last,
      email_address,
      signature,
      ...otherFields
    } = req.body;

    // Validate signature
    const dataToValidate = { ...req.body };
    delete dataToValidate.signature;
    
    const isValidSignature = validateSignature(dataToValidate, signature);

    if (!isValidSignature) {
      console.error("[PAYFAST ITN] Invalid signature");
      return res.status(400).send("Invalid signature");
    }

    console.log("[PAYFAST ITN] Signature valid, updating order...");

    // Find and update order
    const order = await PayfastOrder.findOne({ m_payment_id });

    if (!order) {
      console.error("[PAYFAST ITN] Order not found:", m_payment_id);
      return res.status(404).send("Order not found");
    }

    // Update order based on payment status
    order.gateway_txn_id = pf_payment_id;
    order.payment_status = payment_status;
    
    if (payment_status === "COMPLETE") {
      order.status = "paid";
      order.gateway_status = "completed";
    } else if (payment_status === "CANCELLED") {
      order.status = "cancelled";
      order.gateway_status = "cancelled";
    } else if (payment_status === "FAILED") {
      order.status = "error";
      order.gateway_status = "failed";
    } else {
      order.gateway_status = payment_status?.toLowerCase();
    }

    await order.save();

    console.log("[PAYFAST ITN] Order updated:", {
      orderId: order._id,
      paymentId: m_payment_id,
      status: order.status,
      paymentStatus: payment_status,
    });

    res.status(200).send("OK");
  } catch (error: any) {
    console.error("[PAYFAST ITN ERROR]", error);
    res.status(500).send("Internal server error");
  }
});

/**
 * GET /api/payfast/status/:paymentId
 * Get payment status by payment ID
 */
router.get("/status/:paymentId", async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const order = await PayfastOrder.findOne({ m_payment_id: paymentId });

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    res.json({
      success: true,
      status: order.status,
      paymentStatus: order.payment_status,
      gatewayTxnId: order.gateway_txn_id,
      total: order.total_cents,
    });
  } catch (error: any) {
    console.error("[PAYFAST STATUS ERROR]", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
