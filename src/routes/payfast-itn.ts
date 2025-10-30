import express from 'express';
import crypto from 'crypto';
import PayfastOrder from '../models/PayfastOrder';

const router = express.Router();

// Verify PayFast signature (no passphrase)
// Recomputes MD5 hash over sorted, encoded form fields excluding signature
function verifySignature(data: Record<string, any>, receivedSignature: string): boolean {
  // Remove signature from data
  const { signature, ...dataToVerify } = data;
  
  // Sort keys alphabetically and build querystring
  const sortedKeys = Object.keys(dataToVerify).sort();
  const queryString = sortedKeys
    .map(key => {
      const value = String(dataToVerify[key]);
      const encoded = encodeURIComponent(value).replace(/%20/g, '+');
      return `${key}=${encoded}`;
    })
    .join('&');

  // MD5 hash
  const calculatedSignature = crypto.createHash('md5').update(queryString).digest('hex');
  
  console.log('PayFast ITN signature verification:', {
    calculated: calculatedSignature,
    received: receivedSignature,
    match: calculatedSignature === receivedSignature
  });
  
  return calculatedSignature === receivedSignature;
}

// PayFast ITN (Instant Transaction Notification) endpoint
// Accepts application/x-www-form-urlencoded POST from PayFast
router.post('/itn', async (req: express.Request, res: express.Response) => {
  try {
    console.log('PayFast ITN received:', JSON.stringify(req.body, null, 2));

    const pfData = req.body;
    const { signature, m_payment_id, payment_status, amount_gross } = pfData;

    if (!signature || !m_payment_id || !payment_status || !amount_gross) {
      console.error('PayFast ITN: Missing required fields');
      return res.status(400).send('Missing required fields');
    }

    // 1. Verify signature
    if (!verifySignature(pfData, signature)) {
      console.error('PayFast ITN: Invalid signature');
      return res.status(400).send('Invalid signature');
    }

    // 2. Find order by m_payment_id
    const order = await PayfastOrder.findOne({ number: m_payment_id });
    if (!order) {
      console.error('PayFast ITN: Order not found:', m_payment_id);
      return res.status(404).send('Order not found');
    }

    // Idempotency guard: if we've already recorded this pf_payment_id or the order is paid, skip
    const existingPfId = order.payment?.pfData?.pf_payment_id || order.payment?.pfData?.pf_payment_id;
    if (order.status === 'paid' || (pfData && existingPfId && pfData.pf_payment_id && existingPfId === pfData.pf_payment_id)) {
      console.log('PayFast ITN: Duplicate/Already processed ITN for', m_payment_id, 'pf_payment_id:', pfData?.pf_payment_id);
      return res.status(200).send('OK');
    }

    // 3. Verify amount matches order total
    const expectedAmount = parseFloat(order.totals.grandTotal.toFixed(2));
    const receivedAmount = parseFloat(amount_gross);
    
    if (Math.abs(expectedAmount - receivedAmount) > 0.01) {
      console.error(`PayFast ITN: Amount mismatch. Expected: R${expectedAmount}, Received: R${receivedAmount}`);
      return res.status(400).send('Amount mismatch');
    }

    // 4. Update order based on payment status
    if (payment_status === 'COMPLETE') {
      order.status = 'paid';
      order.payment = {
        provider: 'payfast',
        pfData,
        result: 'COMPLETE'
      };
      await order.save();
      
      // TODO: Decrement stock for each item in order.items
      console.log(`✓ PayFast ITN: Order ${m_payment_id} marked as PAID (R${receivedAmount})`);
      
    } else if (payment_status === 'CANCELLED' || payment_status === 'FAILED') {
      order.status = 'cancelled';
      order.payment = {
        provider: 'payfast',
        pfData,
        result: payment_status
      };
      await order.save();
      console.log(`✗ PayFast ITN: Order ${m_payment_id} marked as ${payment_status}`);
      
    } else {
      // Handle other statuses (PENDING, etc.)
      order.payment = { provider: 'payfast', pfData, result: payment_status };
      await order.save();
      console.log(`⚠ PayFast ITN: Order ${m_payment_id} status: ${payment_status}`);
    }

    // TODO: Add PayFast IP/host validation for production
    // Valid IPs: 196.33.190.0/23, 197.221.189.0/24
    
    // TODO: Add idempotency guard to prevent duplicate processing
    // Store pf_payment_id and skip if already processed

    // Respond with 200 OK to acknowledge receipt
    res.status(200).send('OK');
    
  } catch (error: any) {
    console.error('PayFast ITN error:', error);
    res.status(500).send('Server error');
  }
});

export default router;
