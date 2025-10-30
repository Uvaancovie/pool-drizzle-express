import express from 'express';
import crypto from 'crypto';
import PayfastOrder from '../models/PayfastOrder';
import mongoose from 'mongoose';

const router = express.Router();

// Generate PayFast signature (no passphrase)
// Sorts fields alphabetically, URL-encodes values (spaces as +), computes MD5 hash
function generateSignature(data: Record<string, any>): string {
  // Sort keys alphabetically and build querystring
  const sortedKeys = Object.keys(data).sort();
  const queryString = sortedKeys
    .map(key => {
      // URL encode values, spaces as +
      const value = String(data[key]);
      const encoded = encodeURIComponent(value).replace(/%20/g, '+');
      return `${key}=${encoded}`;
    })
    .join('&');

  // MD5 hash
  return crypto.createHash('md5').update(queryString).digest('hex');
}

router.post('/', async (req: express.Request, res: express.Response) => {
  try {
    const { items, shippingAddress, shippingOption, contactEmail, contactName } = req.body;

    if (!items || !shippingAddress || !shippingOption) {
      return res.status(400).json({ error: 'Missing required fields: items, shippingAddress, shippingOption' });
    }

    // TODO: Validate items against database and recalculate prices to prevent manipulation
    // For now, trust client-provided prices (NOT PRODUCTION READY)
    const subtotal = items.reduce((sum: number, item: any) => 
      sum + (item.priceAtPurchase * item.qty), 0
    );
    const shipping = shippingOption.price || 0;
    
    // Format to 2 decimals as required by PayFast
    const grandTotal = parseFloat((subtotal + shipping).toFixed(2));

    // Generate unique order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create order with status 'pending'
    const order = await PayfastOrder.create({
      number: orderNumber,
      items: items.map((item: any) => ({
        productId: item.productId,
        variant: item.variant,
        qty: item.qty,
        priceAtPurchase: item.priceAtPurchase
      })),
      totals: {
        subtotal: parseFloat(subtotal.toFixed(2)),
        shipping: parseFloat(shipping.toFixed(2)),
        discount: 0,
        vat: 0,
        grandTotal
      },
      status: 'pending',
      shipping: {
        name: shippingAddress.name || contactName,
        phone: shippingAddress.phone,
        address1: shippingAddress.address1,
        address2: shippingAddress.address2,
        city: shippingAddress.city,
        province: shippingAddress.province,
        postalCode: shippingAddress.postalCode
      },
      customerEmail: contactEmail,
      customerName: contactName
    });

    // Build PayFast redirect URL
    const mode = process.env.PAYFAST_MODE === 'live' 
      ? 'https://www.payfast.co.za/eng/process' 
      : 'https://sandbox.payfast.co.za/eng/process';
    
    // Build PayFast data object (no passphrase)
    const payfastData: Record<string, any> = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY,
      return_url: process.env.PAYFAST_RETURN_URL,
      cancel_url: process.env.PAYFAST_CANCEL_URL,
      notify_url: process.env.PAYFAST_NOTIFY_URL,
      name_first: (contactName || shippingAddress.name || 'Customer').split(' ')[0],
      email_address: contactEmail || 'customer@poolbeanbags.co.za',
      m_payment_id: orderNumber,
      amount: grandTotal.toFixed(2),
      item_name: `Pool Beanbags Order ${orderNumber}`
    };

    // Generate signature without passphrase
    const signature = generateSignature(payfastData);
    payfastData.signature = signature;

    // Build query string for redirect
    const queryString = Object.keys(payfastData)
      .map(key => `${key}=${encodeURIComponent(payfastData[key])}`)
      .join('&');

    const redirectUrl = `${mode}?${queryString}`;

    console.log(`Checkout: Created order ${orderNumber} with total R${grandTotal}`);

    res.json({
      redirect: redirectUrl,
      orderNumber: order.number
    });
  } catch (error: any) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Checkout failed', details: error.message });
  }
});

// New endpoint: POST /api/checkout/create-order
// This matches the UPSTREAM_CHECKOUT_URL used by the frontend proxy when set to
// https://pool-drizzle-express.onrender.com/api/checkout/create-order
router.post('/create-order', async (req: express.Request, res: express.Response) => {
  try {
    const { items, subtotal_cents, shipping_cents, total_cents, courier } = req.body || {}

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'INVALID_ITEMS' })
    }

    // Recompute totals server-side using cents to prevent manipulation
    const recomputedSubtotal = items.reduce((sum: number, item: any) => {
      const price = typeof item.price === 'number' ? item.price : (typeof item.priceAtPurchase === 'number' ? item.priceAtPurchase : 0)
      const qty = typeof item.quantity === 'number' ? item.quantity : (typeof item.qty === 'number' ? item.qty : 1)
      return sum + (price * qty)
    }, 0)

    const recomputedShipping = 20000 // R200 flat fee (cents)
    const recomputedTotal = recomputedSubtotal + recomputedShipping

    // Optional: validate client-sent totals if provided
    if (typeof total_cents === 'number' && recomputedTotal !== total_cents) {
      return res.status(400).json({ error: 'TOTAL_MISMATCH', recomputedTotal })
    }

    // Persist a PayfastOrder so ITN can find & update it when PayFast notifies
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2,6).toUpperCase()}`

    const payfastOrder = await PayfastOrder.create({
      number: orderNumber,
      items: items.map((it: any) => ({
        productId: it.productId || it.id || null,
        variant: it.variant || null,
        qty: typeof it.quantity === 'number' ? it.quantity : (typeof it.qty === 'number' ? it.qty : 1),
        priceAtPurchase: typeof it.price === 'number' ? it.price : (typeof it.priceAtPurchase === 'number' ? it.priceAtPurchase : 0)
      })),
      totals: {
        subtotal: recomputedSubtotal / 100,
        shipping: recomputedShipping / 100,
        discount: 0,
        vat: 0,
        grandTotal: recomputedTotal / 100
      },
      status: 'pending',
      shipping: {
        name: (req.body?.shippingAddress?.name) || req.body?.contactName || 'Customer',
        phone: req.body?.shippingAddress?.phone || '',
        address1: req.body?.shippingAddress?.address1 || '',
        address2: req.body?.shippingAddress?.address2 || '',
        city: req.body?.shippingAddress?.city || '',
        province: req.body?.shippingAddress?.province || '',
        postalCode: req.body?.shippingAddress?.postalCode || ''
      },
      customerEmail: req.body?.contactEmail || '',
      customerName: req.body?.contactName || ''
    })

    // Build PayFast payload (no passphrase assumed)
    const payfastPayload: Record<string, any> = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY,
      return_url: process.env.PAYFAST_RETURN_URL,
      cancel_url: process.env.PAYFAST_CANCEL_URL,
      notify_url: process.env.PAYFAST_NOTIFY_URL,
      m_payment_id: payfastOrder.number,
      amount: ((recomputedTotal) / 100).toFixed(2),
      item_name: `Pool Beanbags Order ${payfastOrder.number}`,
      item_description: `Flat shipping R ${(recomputedShipping/100).toFixed(2)} via ${courier || 'Fastway'}`,
    }

    return res.json({ payfast: payfastPayload, orderNumber: payfastOrder.number })
  } catch (err: any) {
    console.error('create-order (router) error:', err)
    return res.status(500).json({ error: 'SERVER_ERROR', detail: err?.message })
  }
})

// Generate PayFast payment link for existing order (from order confirmation page)
router.post('/pay/:orderId', async (req: express.Request, res: express.Response) => {
  try {
    const { orderId } = req.params;

    // Try to find order in PayfastOrder first, then fall back to Order model
    let order: any = await PayfastOrder.findById(orderId);
    let isPayfastOrder = true;
    
    if (!order) {
      // Try the regular Order model - access the already-compiled model
      const Order = mongoose.models.Order || mongoose.model('Order');
      order = await Order.findById(orderId);
      isPayfastOrder = false;
    }
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Only allow payment for pending orders
    const orderStatus = isPayfastOrder ? order.status : order.status;
    if (orderStatus !== 'pending') {
      return res.status(400).json({ error: `Order is already ${orderStatus}. Cannot process payment.` });
    }

    // Get order details based on model type
    let grandTotal: number;
    let orderNumber: string;
    let customerName: string;
    let customerEmail: string;

    if (isPayfastOrder) {
      grandTotal = order.totals.grandTotal;
      orderNumber = order.number;
      customerName = order.customerName || order.shipping?.name || 'Customer';
      customerEmail = order.customerEmail || 'customer@poolbeanbags.co.za';
    } else {
      // Regular Order model
      grandTotal = order.total_cents ? order.total_cents / 100 : (order.total || 0);
      orderNumber = order.order_no;
      
      // Try to get customer info from address - use already compiled model
      const Address = mongoose.models.Address || mongoose.model('Address');
      let shippingAddress = null;
      if (order.shipping_address_id) {
        shippingAddress = await Address.findById(order.shipping_address_id);
      }
      
      customerName = shippingAddress 
        ? `${shippingAddress.first_name} ${shippingAddress.last_name}`
        : 'Customer';
      customerEmail = shippingAddress?.email || order.email || 'customer@poolbeanbags.co.za';
    }

    // Build PayFast redirect URL
    const mode = process.env.PAYFAST_MODE === 'live' 
      ? 'https://www.payfast.co.za/eng/process' 
      : 'https://sandbox.payfast.co.za/eng/process';
    
    // Build PayFast data object (no passphrase)
    const payfastData: Record<string, any> = {
      merchant_id: process.env.PAYFAST_MERCHANT_ID,
      merchant_key: process.env.PAYFAST_MERCHANT_KEY,
      return_url: process.env.PAYFAST_RETURN_URL,
      cancel_url: process.env.PAYFAST_CANCEL_URL,
      notify_url: process.env.PAYFAST_NOTIFY_URL,
      name_first: customerName.split(' ')[0],
      email_address: customerEmail,
      m_payment_id: orderNumber,
      amount: grandTotal.toFixed(2),
      item_name: `Pool Beanbags Order ${orderNumber}`
    };

    // Generate signature without passphrase
    const signature = generateSignature(payfastData);
    payfastData.signature = signature;

    // Build query string for redirect
    const queryString = Object.keys(payfastData)
      .map(key => `${key}=${encodeURIComponent(payfastData[key])}`)
      .join('&');

    const redirectUrl = `${mode}?${queryString}`;

    console.log(`Generated payment link for order ${orderNumber} (${isPayfastOrder ? 'PayfastOrder' : 'Order'})`);

    res.json({ redirect: redirectUrl });
  } catch (error: any) {
    console.error('Payment link generation error:', error);
    res.status(500).json({ error: 'Failed to generate payment link', details: error.message });
  }
});

export default router;