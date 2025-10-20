import express from 'express';
import crypto from 'crypto';
import PayfastOrder from '../models/PayfastOrder';

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

export default router;
