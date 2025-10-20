import express from 'express';

const router = express.Router();

// Shipping quote endpoint
// Calculates shipping based on destination, cart total, and out-of-area flag
router.post('/quote', (req: express.Request, res: express.Response) => {
  try {
    const { cartTotal, destination, outOfArea } = req.body;

    if (!cartTotal || !destination) {
      return res.status(400).json({ error: 'cartTotal and destination are required' });
    }

    const { city, province, postalCode } = destination;

    // Determine shipping bucket
    let basePrice = 0;
    let etaDays = '';
    let code = '';
    let name = '';

    // Normalize city/province for matching
    const cityLower = (city || '').toLowerCase().trim();
    const provinceLower = (province || '').toLowerCase().trim();

    // KZN bucket - R129, 1-2 days
    if (provinceLower.includes('kwazulu') || provinceLower.includes('kzn') || 
        provinceLower.includes('natal')) {
      basePrice = 129;
      etaDays = '1–2';
      code = 'KZN';
      name = 'KZN Delivery';
    }
    // MAJOR centres bucket - R199, 2-3 days
    // Cities: Johannesburg, Pretoria, Cape Town, Gqeberha/Port Elizabeth, Durban, Pietermaritzburg, Bloemfontein
    // Provinces: Gauteng, Western Cape, Eastern Cape, Free State, KwaZulu-Natal
    else if (
      (cityLower.includes('johannesburg') || cityLower.includes('jhb') || 
       cityLower.includes('pretoria') || cityLower.includes('pta') ||
       cityLower.includes('cape town') || cityLower.includes('capetown') ||
       cityLower.includes('gqeberha') || cityLower.includes('port elizabeth') || cityLower.includes('pe') ||
       cityLower.includes('durban') || cityLower.includes('dbn') ||
       cityLower.includes('pietermaritzburg') || cityLower.includes('pmb') ||
       cityLower.includes('bloemfontein')) &&
      (provinceLower.includes('gauteng') || provinceLower.includes('western cape') ||
       provinceLower.includes('eastern cape') || provinceLower.includes('free state') ||
       provinceLower.includes('kwazulu'))
    ) {
      basePrice = 199;
      etaDays = '2–3';
      code = 'MAJOR';
      name = 'Major Centre Delivery';
    }
    // REMOTE bucket - R279, 3-5 days
    else {
      basePrice = 279;
      etaDays = '3–5';
      code = 'REMOTE';
      name = 'Remote Area Delivery';
    }

    // Add OAD (Out of Area) surcharge if applicable
    if (outOfArea) {
      basePrice += 70;
      name += ' (Out of Area)';
    }

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
