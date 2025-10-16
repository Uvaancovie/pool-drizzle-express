import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { supabase } from './supabaseClient';
import { db } from './db/client';
import { orders, products, announcements, product_images, users, addresses, order_items, order_delivery, contacts } from './db/schema';
import { desc, eq, and, gte, lte, or, isNotNull } from 'drizzle-orm';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(bodyParser.json());
// Configure CORS to allow the frontend origin(s). Set FRONTEND_ORIGIN in deployment to
// e.g. 'https://poolbeanbags-frontend.vercel.app' or multiple origins separated by commas.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'https://poolbeanbags-frontend.vercel.app').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (e.g., curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
    // fallback: allow if wildcard present
    if (allowedOrigins.indexOf('*') !== -1) return callback(null, true);
    return callback(new Error('CORS policy does not allow this origin'), false);
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));

// JWT Authentication middleware
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    (req as any).user = user;
    next();
  });
};

// Admin only middleware
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if ((req as any).user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Authentication routes
app.post('/api/auth/login', async (req: express.Request, res: express.Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const userResult = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (userResult.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name
      }
    });
  } catch (err: any) {
    console.error('Login error:', err?.message || err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/register', async (req: express.Request, res: express.Response) => {
  const { email, password, first_name, last_name, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await db.insert(users).values({
      email,
      password_hash: hashedPassword,
      first_name,
      last_name,
      role: role || 'customer'
    }).returning();

    const user = newUser[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name
      }
    });
  } catch (err: any) {
    console.error('Registration error:', err?.message || err);
    if (err?.message?.includes('duplicate key')) {
      res.status(409).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

// Protected route to get current user
app.get('/api/auth/me', authenticateToken, async (req: express.Request, res: express.Response) => {
  const user = (req as any).user;
  res.json({ user });
});

// Checkout endpoint: create an order and return a mock redirect (in real app generate Ozow request)
app.post('/api/checkout/ozow', async (req: express.Request, res: express.Response) => {
  const { orderNo, amount, customer, returnUrl, notifyUrl } = req.body;
  if (!orderNo || !amount) return res.status(400).json({ error: 'orderNo and amount required' });

  // insert order (minimal)
  try {
    await db.insert(orders).values({ order_no: orderNo, payment_status: 'pending', status: 'pending', total_cents: Math.round(amount * 100) });
  } catch (err) {
    console.error('db insert error', err);
  }

  // In real integration, call Ozow create-payment and return redirectUrl
  return res.json({ redirectUrl: process.env.OZOW_RETURN_URL || returnUrl || '/', requestId: 'mock-req-123' });
});

// Webhook endpoint: Verify signature (not implemented) and mark order paid
app.post('/api/ozow/webhook', async (req: express.Request, res: express.Response) => {
  const payload = req.body;
  // TODO: verify Hash using OZOW_PRIVATE_KEY
  const reference = payload.Reference;
  const status = payload.Status;

  if (!reference) return res.status(400).send('Missing reference');

  if (status === 'Completed') {
    try {
  await db.update(orders).set({ payment_status: 'paid', status: 'paid' }).where(eq(orders.order_no, reference));
    } catch (err) {
      console.error('db update error', err);
    }
  }

  res.send('ok');
});

// Invoice generation: generate simple PDF and stream it
app.get('/api/invoices/:orderNo', async (req: express.Request, res: express.Response) => {
  const { orderNo } = req.params;

  // Fetch order — minimal
  // In real app, fetch order details and items

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${orderNo}.pdf"`);

  const doc = new PDFDocument();
  doc.pipe(res);
  doc.fontSize(20).text('Invoice', { align: 'center' });
  doc.moveDown();
  doc.text(`Order: ${orderNo}`);
  doc.text(`Date: ${new Date().toISOString()}`);
  doc.end();
});

// Uploads: accept multipart and store to Supabase storage (bucket 'product-images')
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/uploads', upload.single('file'), async (req: express.Request, res: express.Response) => {
  const productId = req.query.productId as string | undefined;
  // multer augments Request with file
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: 'file required' });

  const key = `${productId || 'misc'}/${Date.now()}-${file.originalname}`;
  const bucket = process.env.SUPABASE_BUCKET || 'images';

  const { data, error } = await supabase.storage.from(bucket).upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) {
    console.error('supabase upload error', error);
    return res.status(500).json({ error: error.message });
  }

  // Try to create a signed URL for private buckets; fallback to public URL
  let publicUrl = supabase.storage.from(bucket).getPublicUrl(key).data.publicUrl;
  try {
    const signed = await supabase.storage.from(bucket).createSignedUrl(key, 60 * 60);
    const signedUrl = signed?.data?.signedUrl;
    if (signedUrl) publicUrl = signedUrl;
  } catch (err) {
    // ignore
  }

  res.json({ url: publicUrl, key });
});

// Admin: create product
app.post('/admin/products', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { slug, title, description, base_price_cents, status } = req.body;
  if (!slug || !title) return res.status(400).json({ error: 'slug and title required' });
  try {
    const insert = await db.insert(products).values({ slug, title, description, base_price_cents: base_price_cents || 0, status: status || 'draft' }).returning();
    res.json({ product: insert });
  } catch (err: any) {
    console.error('create product error', err?.message || err);
    res.status(500).json({ error: 'failed to create product' });
  }
});

// Admin: create announcement
app.post('/admin/announcements', authenticateToken, requireAdmin, upload.single('banner_image'), async (req: express.Request, res: express.Response) => {
  const isMultipart = !!(req as any).file;
  const body = isMultipart ? req.body : req.body;
  const { slug, title, excerpt, body_richtext, start_at, end_at, is_featured } = body as any;
  if (!slug || !title) return res.status(400).json({ error: 'slug and title required' });

  try {
    let bannerImageUrl = null;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (file) {
      const bucket = process.env.SUPABASE_BUCKET || 'images';
      const key = `announcements/${Date.now()}-${file.originalname}`;
      const { data, error } = await supabase.storage.from(bucket).upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
      if (!error) {
        bannerImageUrl = key;
      }
    }

    const insert = await db.insert(announcements).values({
      slug,
      title,
      excerpt,
      body_richtext,
      banner_image: bannerImageUrl,
      start_at: start_at ? new Date(start_at) : null,
      end_at: end_at ? new Date(end_at) : null,
      is_featured: !!is_featured
    }).returning();
    res.json({ announcement: insert });
  } catch (err: any) {
    console.error('create announcement error', err?.message || err);
    res.status(500).json({ error: 'failed to create announcement' });
  }
});

// Admin: list announcements
app.get('/admin/announcements', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const all = await db.select().from(announcements).orderBy(desc(announcements.created_at));
    res.json({ announcements: all });
  } catch (err: any) {
    console.error('list announcements error', err?.message || err);
    res.status(500).json({ error: 'failed to list announcements' });
  }
});

// Admin: update announcement
app.put('/admin/announcements/:id', authenticateToken, requireAdmin, upload.single('banner_image'), async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const isMultipart = !!(req as any).file;
  const body = isMultipart ? req.body : req.body;
  const { slug, title, excerpt, body_richtext, start_at, end_at, is_featured } = body as any;

  try {
    let bannerImageUrl = undefined;
    const file = (req as any).file as Express.Multer.File | undefined;
    if (file) {
      const bucket = process.env.SUPABASE_BUCKET || 'images';
      const key = `announcements/${Date.now()}-${file.originalname}`;
      const { data, error } = await supabase.storage.from(bucket).upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
      if (!error) {
        bannerImageUrl = key;
      }
    }

    const update = await db.update(announcements).set({
      slug,
      title,
      excerpt,
      body_richtext,
      banner_image: bannerImageUrl,
      start_at: start_at ? new Date(start_at) : null,
      end_at: end_at ? new Date(end_at) : null,
      is_featured: !!is_featured
    }).where(eq(announcements.id, Number(id))).returning();
    res.json({ announcement: update });
  } catch (err: any) {
    console.error('update announcement error', err?.message || err);
    res.status(500).json({ error: 'failed to update announcement' });
  }
});

// Admin: delete announcement
app.delete('/admin/announcements/:id', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    await db.delete(announcements).where(eq(announcements.id, Number(id)));
    res.json({ success: true });
  } catch (err: any) {
    console.error('delete announcement error', err?.message || err);
    res.status(500).json({ error: 'failed to delete announcement' });
  }
});

// Public: list active announcements
app.get('/api/announcements', async (req: express.Request, res: express.Response) => {
  try {
    console.log('Fetching announcements...');
    const now = new Date();
    const active = await db.select().from(announcements)
      .where(or(
        and(lte(announcements.start_at, now), gte(announcements.end_at, now)),
        isNotNull(announcements.published_at)
      ))
      .orderBy(desc(announcements.is_featured), desc(announcements.created_at));

    console.log(`Found ${active.length} active announcements`);

    // Convert banner image keys to signed URLs
    const bucket = process.env.SUPABASE_BUCKET || 'images';
    const announcementsWithImages = await Promise.all(active.map(async (announcement: any) => {
      let bannerImageUrl = null;
      if (announcement.banner_image) {
        try {
          const signed = await supabase.storage.from(bucket).createSignedUrl(announcement.banner_image, 60 * 60);
          bannerImageUrl = signed?.data?.signedUrl || supabase.storage.from(bucket).getPublicUrl(announcement.banner_image).data.publicUrl;
        } catch (err) {
          console.warn(`Failed to create signed URL for announcement image:`, err);
          try {
            bannerImageUrl = supabase.storage.from(bucket).getPublicUrl(announcement.banner_image).data.publicUrl;
          } catch (pubErr) {
            console.warn(`Failed to get public URL for announcement image`);
            bannerImageUrl = null;
          }
        }
      }
      return { ...announcement, banner_image_url: bannerImageUrl };
    }));

    res.json({ announcements: announcementsWithImages });
  } catch (err: any) {
    console.error('list active announcements error:', err?.message || err, 'Stack:', err?.stack);
    res.status(500).json({ error: 'failed to list announcements', details: err?.message });
  }
});

// Public: list products
app.get('/api/products', async (req: express.Request, res: express.Response) => {
  try {
    console.log('Fetching products...');
    const all = await db.select().from(products).limit(100);
    console.log(`Found ${all.length} products`);
    
    const ids = all.map((p: any) => p.id);
    let images: any[] = [];
    
    if (ids.length > 0) {
      try {
        console.log(`Fetching images for ${ids.length} products...`);
        images = await db.select().from(product_images).limit(1000);
        console.log(`Found ${images.length} total images`);
        images = images.filter((img: any) => ids.includes(img.product_id));
        console.log(`Filtered to ${images.length} images for these products`);
      } catch (imgErr: any) {
        console.warn('Error fetching images, continuing without images:', imgErr?.message);
        images = [];
      }
    }

    // attach images to products and convert storage keys to signed URLs
    const bucket = process.env.SUPABASE_BUCKET || 'images';
    console.log(`Using bucket: ${bucket}`);
    
    const productsWithImages = await Promise.all(all.map(async (p: any) => {
      const imgs = images.filter(img => img.product_id === p.id);
      const converted = await Promise.all(imgs.map(async (img: any) => {
        try {
          const signed = await supabase.storage.from(bucket).createSignedUrl(img.url, 60 * 60);
          return { ...img, url: signed?.data?.signedUrl || supabase.storage.from(bucket).getPublicUrl(img.url).data.publicUrl };
        } catch (err) {
          console.warn(`Failed to create signed URL for ${img.url}, using public URL:`, err);
          try {
            return { ...img, url: supabase.storage.from(bucket).getPublicUrl(img.url).data.publicUrl };
          } catch (pubErr) {
            console.warn(`Failed to get public URL for ${img.url}`);
            return { ...img, url: null };
          }
        }
      }));
      return { ...p, images: converted };
    }));
    
    console.log(`Returning ${productsWithImages.length} products with images`);
    res.json({ products: productsWithImages });
  } catch (err: any) {
    console.error('list products error:', err?.message || err, 'Stack:', err?.stack);
    res.status(500).json({ error: 'failed to list products', details: err?.message });
  }
});

// Public: get single product by slug
app.get('/api/products/:slug', async (req: express.Request, res: express.Response) => {
  const { slug } = req.params;
  try {
    const rows = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'not found' });
    const product = rows[0];
    const images = await db.select().from(product_images).limit(1000);
    const imgs = images.filter((img: any) => img.product_id === product.id);
    const bucket = process.env.SUPABASE_BUCKET || 'images';
    const converted = await Promise.all(imgs.map(async (img: any) => {
      try {
        const signed = await supabase.storage.from(bucket).createSignedUrl(img.url, 60 * 60);
        return { ...img, url: signed?.data?.signedUrl || supabase.storage.from(bucket).getPublicUrl(img.url).data.publicUrl };
      } catch (err) {
        return { ...img, url: supabase.storage.from(bucket).getPublicUrl(img.url).data.publicUrl };
      }
    }));
    res.json({ product: { ...product, images: converted } });
  } catch (err: any) {
    console.error('get product error', err?.message || err);
    res.status(500).json({ error: 'failed to get product' });
  }
});

// Update a product (admin)
app.put('/api/products/:id', upload.single('image'), async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const body = req.body as any;
  try {
    // Update product (don't update slug as it's the identifier)
    const update = await db.update(products).set({
      title: body.title,
      description: body.description,
      base_price_cents: body.base_price_cents ? Number(body.base_price_cents) : undefined,
      status: body.status,
      is_promotional: body.is_promotional !== undefined ? !!body.is_promotional : undefined,
      promotion_text: body.promotion_text,
      promotion_discount_percent: body.promotion_discount_percent !== undefined ? Number(body.promotion_discount_percent) : undefined
    }).where(eq(products.id, Number(id))).returning();

    // handle image replacement
    const file = (req as any).file as Express.Multer.File | undefined;
    if (file) {
      const bucket = process.env.SUPABASE_BUCKET || 'images';
      const key = `products/${id}/${Date.now()}-${file.originalname}`;

      // First, try to delete existing images for this product
      try {
        const existingImages = await db.select().from(product_images).where(eq(product_images.product_id, Number(id)));
        for (const img of existingImages) {
          await supabase.storage.from(bucket).remove([img.url]);
        }
        await db.delete(product_images).where(eq(product_images.product_id, Number(id)));
      } catch (deleteErr) {
        console.error('Error deleting existing images:', deleteErr);
      }

      // Upload new image
      const { data, error } = await supabase.storage.from(bucket).upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
      if (!error) {
        // store storage key
        await db.insert(product_images).values({ product_id: Number(id), url: key, alt: file.originalname, sort: 0 }).returning();
      }
    }

    res.json({ updated: update });
  } catch (err: any) {
    console.error('update product error', err?.message || err);
    res.status(500).json({ error: 'failed to update product' });
  }
});

// Public: create product (allow for simple client-side posting during dev)
app.post('/api/products', upload.single('image'), async (req: express.Request, res: express.Response) => {
  // Supports both JSON body and multipart/form-data with single 'image' file
  const isMultipart = !!(req as any).file;
  const body = isMultipart ? req.body : req.body;
  const { slug, title, description, base_price_cents, status, is_promotional, promotion_text, promotion_discount_percent } = body as any;
  if (!slug || !title) return res.status(400).json({ error: 'slug and title required' });

  try {
    const insert = await db.insert(products).values({
      slug,
      title,
      description,
      base_price_cents: base_price_cents || 0,
      status: status || 'draft',
      is_promotional: !!is_promotional,
      promotion_text,
      promotion_discount_percent: promotion_discount_percent ? Number(promotion_discount_percent) : undefined
    }).returning();
    const created = Array.isArray(insert) ? insert[0] : insert;

    // If file present, upload to supabase storage and insert product_images
    const file = (req as any).file as Express.Multer.File | undefined;
    if (file) {
      const bucket = process.env.SUPABASE_BUCKET || 'images';
      const key = `products/${created.id}/${Date.now()}-${file.originalname}`;
      const { data, error } = await supabase.storage.from(bucket).upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
      if (error) {
        console.error('supabase upload error', error);
      } else {
        try {
          // store storage key (path) so we can create signed URLs later
          await db.insert(product_images).values({ product_id: created.id, url: key, alt: file.originalname, sort: 0 }).returning();
        } catch (err) {
          console.error('insert product_images error', err);
        }
      }
    }

    res.json({ product: created });
  } catch (err: any) {
    console.error('create product error', err?.message || err);
    res.status(500).json({ error: 'failed to create product' });
  }
});

// Seed admin user if it doesn't exist
async function seedAdminUser() {
  try {
    const existingAdmin = await db.query.users.findFirst({
      where: eq(users.email, 'admin@poolbeanbags.com')
    });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('password', 10);
      await db.insert(users).values({
        email: 'admin@poolbeanbags.com',
        password_hash: hashedPassword,
        role: 'admin',
        first_name: 'Admin',
        last_name: 'User'
      });
      console.log('Admin user created successfully with email: admin@poolbeanbags.com');
    } else {
      console.log('Admin user already exists');
      // Update password to new value
      const hashedPassword = await bcrypt.hash('password', 10);
      await db.update(users).set({ password_hash: hashedPassword }).where(eq(users.email, 'admin@poolbeanbags.com'));
      console.log('Admin password updated to: password');
    }
  } catch (err) {
    console.error('Error seeding admin user:', err);
  }
}

// Cart and Order Management APIs

// Add item to cart (handled on frontend with localStorage, but we provide product validation)
app.post('/api/cart/validate', async (req: express.Request, res: express.Response) => {
  const { productId, quantity } = req.body;
  try {
    const product = await db.query.products.findFirst({
      where: eq(products.id, productId)
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.status !== 'published') {
      return res.status(400).json({ error: 'Product not available' });
    }

    res.json({
      product: {
        id: product.id,
        title: product.title,
        slug: product.slug,
        price: product.base_price_cents,
        is_promotional: product.is_promotional,
        promotion_discount_percent: product.promotion_discount_percent
      }
    });
  } catch (err) {
    console.error('Cart validation error:', err);
    res.status(500).json({ error: 'Failed to validate product' });
  }
});

// Create order (checkout)
app.post('/api/orders', async (req: express.Request, res: express.Response) => {
  const {
    items,
    deliveryMethod,
    customerInfo,
    pickupDate,
    pickupTime,
    shippingAddress
  } = req.body;

  try {
    // Generate order number
    const orderNo = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    // Calculate totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await db.query.products.findFirst({
        where: eq(products.id, item.productId)
      });

      if (!product) {
        return res.status(400).json({ error: `Product ${item.productId} not found` });
      }

      const unitPrice = product.is_promotional && product.promotion_discount_percent
        ? Math.round(product.base_price_cents * (1 - product.promotion_discount_percent / 100))
        : product.base_price_cents;

      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;

      orderItems.push({
        product_id: item.productId,
        product_variant_id: null,
        quantity: item.quantity,
        unit_price_cents: unitPrice,
        total_price_cents: totalPrice,
        product_title: product.title,
        product_slug: product.slug
      });
    }

    // Create or find customer
    let customer = await db.query.users.findFirst({
      where: eq(users.email, customerInfo.email)
    });

    if (!customer) {
      // Create new customer account
      const [newCustomer] = await db.insert(users).values({
        email: customerInfo.email,
        password_hash: '', // No password for guest accounts
        role: 'customer',
        first_name: customerInfo.firstName,
        last_name: customerInfo.lastName,
        phone: customerInfo.phone
      }).returning();
      customer = newCustomer;
    }

    // Create order
    const [order] = await db.insert(orders).values({
      order_no: orderNo,
      user_id: customer.id,
      email: customerInfo.email,
      status: 'pending',
      payment_status: 'pending',
      subtotal_cents: subtotal,
      total_cents: subtotal, // No shipping/tax for now
      gateway: 'cash' // Since no payment integration
    }).returning();

    // Add order items
    for (const item of orderItems) {
      await db.insert(order_items).values({
        order_id: order.id,
        ...item
      });
    }

    // Handle delivery
    let shippingAddressId = null;
    let shippingAddressFallback: any = null;

    if (deliveryMethod === 'shipping') {
      // Basic validation for shipping address
      if (!shippingAddress || !shippingAddress.addressLine1 || !shippingAddress.city || !shippingAddress.postalCode) {
        return res.status(400).json({ error: 'Shipping address must include addressLine1, city and postalCode' });
      }

      // attempt to persist the shipping address; if it fails, keep a fallback in memory
      try {
        const [address] = await db.insert(addresses).values({
          user_id: customer.id,
          type: 'shipping',
          first_name: customerInfo.firstName,
          last_name: customerInfo.lastName,
          email: customerInfo.email,
          phone: customerInfo.phone,
          address_line_1: shippingAddress.addressLine1,
          address_line_2: shippingAddress.addressLine2 || null,
          city: shippingAddress.city,
          state: shippingAddress.state || null,
          postal_code: shippingAddress.postalCode,
          country: shippingAddress.country || 'South Africa'
        }).returning();
        shippingAddressId = address.id;
      } catch (err: any) {
        // Log the error but continue — we'll attach the shipping address to order_delivery.notes as a fallback
        console.error('Insert shipping address error:', err?.message || err);
        shippingAddressFallback = {
          firstName: customerInfo.firstName,
          lastName: customerInfo.lastName,
          email: customerInfo.email,
          phone: customerInfo.phone,
          addressLine1: shippingAddress.addressLine1,
          addressLine2: shippingAddress.addressLine2 || null,
          city: shippingAddress.city,
          state: shippingAddress.state || null,
          postalCode: shippingAddress.postalCode,
          country: shippingAddress.country || 'South Africa'
        };
      }
    }

    // Insert order_delivery but don't let failures here block the customer's success response
    try {
      await db.insert(order_delivery).values({
        order_id: order.id,
        delivery_method: deliveryMethod,
        pickup_date: deliveryMethod === 'pickup' ? (pickupDate ? new Date(pickupDate) : null) : null,
        pickup_time: deliveryMethod === 'pickup' ? pickupTime : null,
        shipping_address_id: shippingAddressId,
        notes: shippingAddressFallback ? JSON.stringify({ shippingAddressFallback }) : null
      });
    } catch (err: any) {
      console.error('Insert order_delivery error (non-fatal):', err?.message || err);
      // continue — the order was created and we will return success to the customer
    }

    // Always return success to the customer when the order itself was created
    res.json({
      message: 'Order placed successfully',
      order: {
        id: order.id,
        orderNo: order.order_no,
        status: order.status,
        total: order.total_cents / 100
      }
    });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get user orders
app.get('/api/orders', async (req: express.Request, res: express.Response) => {
  try {
    const userEmail = req.query.email as string;
    if (!userEmail) {
      return res.status(400).json({ error: 'Email required' });
    }

    const userOrders = await db.query.orders.findMany({
      where: eq(orders.email, userEmail),
      orderBy: desc(orders.created_at)
    });

    const ordersWithDetails = await Promise.all(
      userOrders.map(async (order) => {
        const items = await db.query.order_items.findMany({
          where: eq(order_items.order_id, order.id)
        });

        const delivery = await db.query.order_delivery.findFirst({
          where: eq(order_delivery.order_id, order.id)
        });

        return {
          id: order.id,
          orderNo: order.order_no,
          status: order.status,
          total: order.total_cents / 100,
          createdAt: order.created_at,
          items,
          delivery
        };
      })
    );

    res.json({ orders: ordersWithDetails });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

// Get specific order
app.get('/api/orders/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, parseInt(id))
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = await db.query.order_items.findMany({
      where: eq(order_items.order_id, order.id)
    });

    const delivery = await db.query.order_delivery.findFirst({
      where: eq(order_delivery.order_id, order.id)
    });

    res.json({
      order: {
        id: order.id,
        orderNo: order.order_no,
        status: order.status,
        paymentStatus: order.payment_status,
        subtotal: order.subtotal_cents / 100,
        total: order.total_cents / 100,
        createdAt: order.created_at,
        items,
        delivery
      }
    });
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ error: 'Failed to get order' });
  }
});

// Admin: Get all orders
app.get('/api/admin/orders', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    console.log('Fetching all orders for admin...');
    const allOrders = await db.query.orders.findMany({
      orderBy: desc(orders.created_at)
    });
    console.log(`Found ${allOrders.length} orders, building details...`);

    const ordersWithDetails = await Promise.all(
      allOrders.map(async (order) => {
        try {
          const items = await db.query.order_items.findMany({
            where: eq(order_items.order_id, order.id)
          });

          const delivery = await db.query.order_delivery.findFirst({
            where: eq(order_delivery.order_id, order.id)
          });

          const customer = order.user_id ? await db.query.users.findFirst({
            where: eq(users.id, order.user_id)
          }) : null;

          // fetch shipping address details if present
          let shippingAddressFull = null;
          if (delivery && delivery.shipping_address_id) {
            try {
              const addr = await db.query.addresses.findFirst({ where: eq(addresses.id, delivery.shipping_address_id) });
              if (addr) {
                shippingAddressFull = {
                  addressLine1: addr.address_line_1,
                  addressLine2: addr.address_line_2,
                  city: addr.city,
                  state: addr.state,
                  postalCode: addr.postal_code,
                  country: addr.country
                };
              }
            } catch (err) {
              console.error('Error fetching shipping address for order', order.id, err);
            }
          }

          // If we don't have a shipping address row, check for a fallback in delivery.notes
          if (!shippingAddressFull && delivery && delivery.notes) {
            try {
              const parsed = JSON.parse(delivery.notes);
              if (parsed && parsed.shippingAddressFallback) {
                shippingAddressFull = parsed.shippingAddressFallback;
              }
            } catch (err) {
              // ignore parse errors
            }
          }

        // Build a delivery object that includes the resolved shipping address and a flag
        const deliveryWithAddress = delivery ? { ...delivery, shippingAddress: shippingAddressFull } : delivery;
        const needsShipping = !!(delivery && (delivery.delivery_method === 'shipping' || delivery.shipping_address_id || shippingAddressFull));

        return {
          id: order.id,
          orderNo: order.order_no,
          status: order.status,
          paymentStatus: order.payment_status,
          total: order.total_cents / 100,
          createdAt: order.created_at,
          customer: customer ? {
            name: `${customer.first_name} ${customer.last_name}`,
            email: customer.email,
            phone: customer.phone
          } : null,
          items,
          delivery: deliveryWithAddress,
          shippingAddress: shippingAddressFull,
          needsShipping
        };
        } catch (err) {
          console.error('Error building order details for order', order.id, err);
          // Return minimal order data if details fail
          return {
            id: order.id,
            orderNo: order.order_no,
            status: order.status,
            paymentStatus: order.payment_status,
            total: order.total_cents / 100,
            createdAt: order.created_at,
            customer: null,
            items: [],
            delivery: null,
            shippingAddress: null,
            needsShipping: false,
            error: 'Failed to load full order details'
          };
        }
      })
    );

    console.log(`Returning ${ordersWithDetails.length} orders`);
    res.json({ orders: ordersWithDetails });
  } catch (err: any) {
    console.error('Get admin orders error:', err?.message || err, 'Stack:', err?.stack);
    res.status(500).json({ error: 'Failed to get orders', details: err?.message });
  }
});

// Admin: Update order status
app.put('/api/admin/orders/:id/status', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const [updated] = await db.update(orders)
      .set({ status })
      .where(eq(orders.id, parseInt(id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order: updated });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// Admin: Update delivery info
app.put('/api/admin/orders/:id/delivery', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  const { trackingNumber, deliveryStatus, notes } = req.body;

  try {
    const [updated] = await db.update(order_delivery)
      .set({
        tracking_number: trackingNumber,
        delivery_status: deliveryStatus,
        notes,
        updated_at: new Date()
      })
      .where(eq(order_delivery.order_id, parseInt(id)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Delivery info not found' });
    }

    res.json({ delivery: updated });
  } catch (err) {
    console.error('Update delivery error:', err);
    res.status(500).json({ error: 'Failed to update delivery info' });
  }
});

// Generate invoice PDF (placeholder - would need pdfkit or similar)
app.get('/api/orders/:id/invoice', async (req: express.Request, res: express.Response) => {
  const { id } = req.params;
  try {
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, parseInt(id))
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = await db.query.order_items.findMany({
      where: eq(order_items.order_id, order.id)
    });

    // For now, return JSON invoice data
    // In production, generate PDF
    const invoice = {
      orderNo: order.order_no,
      date: order.created_at,
      items: items.map(item => ({
        title: item.product_title,
        quantity: item.quantity,
        unitPrice: item.unit_price_cents / 100,
        total: item.total_price_cents / 100
      })),
      subtotal: order.subtotal_cents / 100,
      total: order.total_cents / 100
    };

    res.json({ invoice });
  } catch (err) {
    console.error('Get invoice error:', err);
    res.status(500).json({ error: 'Failed to get invoice' });
  }
});

// Contact form submission endpoint
app.post('/api/contact', async (req: express.Request, res: express.Response) => {
  const { name, email, phone, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required' });
  }

  try {
    await db.insert(contacts).values({
      name,
      email,
      phone: phone || null,
      message,
      is_read: false
    });

    res.status(201).json({ message: 'Contact form submitted successfully' });
  } catch (err: any) {
    console.error('Contact form submission error:', err?.message || err);
    res.status(500).json({ error: 'Failed to submit contact form' });
  }
});

// Admin endpoint to get all contacts
app.get('/api/admin/contacts', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    console.log('Fetching all contacts for admin...');
    const allContacts = await db.select().from(contacts).orderBy(desc(contacts.created_at));
    console.log(`Found ${allContacts.length} contacts`);
    res.json({ contacts: allContacts });
  } catch (err: any) {
    console.error('Get contacts error:', err?.message || err, 'Stack:', err?.stack);
    res.status(500).json({ error: 'Failed to get contacts', details: err?.message });
  }
});

// Admin endpoint to mark contact as read
app.patch('/api/admin/contacts/:id/read', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  const { id } = req.params;

  try {
    await db.update(contacts).set({ is_read: true }).where(eq(contacts.id, parseInt(id)));
    res.json({ message: 'Contact marked as read' });
  } catch (err: any) {
    console.error('Mark contact as read error:', err?.message || err);
    res.status(500).json({ error: 'Failed to mark contact as read' });
  }
});

app.listen(port, async () => {
  console.log(`Backend listening on http://localhost:${port}`);
  await seedAdminUser();
});
