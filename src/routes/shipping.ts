import express from 'express';

const router = express.Router();

// Shipping quote endpoint
// Flat rate R1000 nationwide via Fastway Couriers for loungers
router.post('/quote', (req: express.Request, res: express.Response) => {
  try {
    const { cartTotal, destination } = req.body;

    if (!cartTotal || !destination) {
      return res.status(400).json({ error: 'cartTotal and destination are required' });
    }

    // Flat rate R1000 nationwide via Fastway Couriers for loungers
    const basePrice = 1000;
    const etaDays = '2–4';
    const code = 'FASTWAY';
    const name = 'Fastway Couriers - Nationwide Delivery';

    // Free shipping for orders >= R1499
    const finalPrice = cartTotal >= 1499 ? 0 : basePrice;

    res.json({
      options: [{
        code,
        name: finalPrice === 0 ? `${name} - FREE` : name,
        price: finalPrice,
        etaDays
      }]
    });
  } catch (error: any) {
    console.error('Shipping quote error:', error);
    res.status(500).json({ error: 'Failed to calculate shipping' });
  }
});

export default router;
