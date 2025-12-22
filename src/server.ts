import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import compression from 'compression';
import dotenv from 'dotenv';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Redis from 'ioredis';
import helmet from 'helmet';
import { connectDB } from './db/mongoose';
import { 
  User, 
  Product, 
  ProductImage, 
  Announcement, 
  Address, 
  Order, 
  OrderItem, 
  OrderDelivery, 
  Contact 
} from './db/models';
import shippingRoutes from './routes/shipping';
import ozowRoutes from './routes/ozow';
import payfastRoutes from './routes/payfast';
import { PayfastOrder } from './models/PayfastOrder';
import OzowOrder from './models/OzowOrder';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// Enable HTTP compression (gzip/deflate)
app.use(compression());

// Security headers
app.use(helmet());

// Body parsers
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true })); // Required for Ozow form posts

// Health check endpoint for keeping Render dyno warm
app.get("/health", (_, res) => res.status(200).send("OK"));

// Configure CORS - allow both production and local development
const allowedOrigins = [
  'https://www.poolbeanbags.co.za',
  'https://poolbeanbags-frontend.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('⚠️ Blocked by CORS:', origin);
      callback(null, true); // Allow anyway for development
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));

app.options('*', cors());

// Initialize Redis cache (optional - works without Redis for now)
let redisClient: Redis | null = null;
if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL);
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    redisClient.on('connect', () => console.log('✓ Redis connected'));
  } catch (err) {
    console.warn('Redis not available, skipping cache');
  }
}

// Connect to MongoDB
connectDB();

// JWT Authentication middleware
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
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

// Seed admin user
async function seedAdminUser() {
  try {
    const adminEmail = 'admin@poolbeanbags.com';
    const existingAdmin = await User.findOne({ email: adminEmail });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('password', 10);
      await User.create({
        email: adminEmail,
        password_hash: hashedPassword,
        role: 'admin',
        first_name: 'Admin',
        last_name: 'User'
      });
      console.log('âœ“ Admin user created successfully');
    }
  } catch (err: any) {
    console.error('Error seeding admin user:', err?.message || err);
  }
}

// =========================
// HEALTH CHECK
// =========================

app.get('/api/health', (req: express.Request, res: express.Response) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// =========================
// PAYMENT ROUTES
// =========================

app.use('/api/shipping', shippingRoutes);
app.use(ozowRoutes); // Ozow routes (includes /api/ozow/create, /api/ozow/redirect, /api/ozow/notify)
app.use('/api/payfast', payfastRoutes); // PayFast routes

// =========================
// AUTHENTICATION ROUTES
// =========================

app.post('/api/auth/login', async (req: express.Request, res: express.Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
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

app.get('/api/auth/me', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const user = await User.findById((req as any).user.id).select('-password_hash');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name
      }
    });
  } catch (err: any) {
    console.error('Get user error:', err?.message || err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// =========================
// CLOUDINARY SIGNED UPLOAD
// =========================

app.post('/api/uploads/sign', authenticateToken, requireAdmin, (req: express.Request, res: express.Response) => {
  const { slug, uuid } = req.body || {};
  const timestamp = Math.floor(Date.now() / 1000);
  const baseFolder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'poolbeanbags';
  const folder = slug ? `${baseFolder}/products/${slug}` : `${baseFolder}/products`;

  const public_id = uuid ? `${uuid}` : undefined;

  // Build signature payload
  const params: any = { folder, timestamp };
  if (public_id) params.public_id = public_id;

  // Sort params alphabetically and build string
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');

  const signature = crypto
    .createHash('sha1')
    .update(sortedParams + process.env.CLOUDINARY_API_SECRET)
    .digest('hex');

  res.json({
    timestamp,
    signature,
    folder,
    public_id,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME
  });
});

// =========================
// PRODUCTS ROUTES
// =========================

app.get('/api/products', async (req: express.Request, res: express.Response) => {
  try {
    const { search, status, featured } = req.query;
    
    // Build cache key from query params
    const cacheKey = `products:${JSON.stringify({ search, status, featured })}`;
    
    // Try cache first
    if (redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
          res.set('X-Cache', 'HIT');
          return res.json(JSON.parse(cached));
        }
      } catch (cacheErr) {
        console.warn('Cache read error:', cacheErr);
      }
    }

    const query: any = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query.status = status;
    }

    if (featured === 'true') {
      query.is_promotional = true;
    }

    const products = await Product.find(query)
      .sort({ created_at: -1 })
      .lean();  // Use lean() for faster queries when you don't need Mongoose documents
    
    // Fetch images for each product
    const productsWithImages = await Promise.all(
      products.map(async (product: any) => {
        const images = await ProductImage.find({ product_id: product._id })
          .sort({ sort: 1 })
          .lean();
        return {
          ...product,
          id: product._id, // Add id alias for frontend compatibility
          images: images.map((img: any) => ({
            id: img._id,
            url: img.url,
            alt: img.alt,
            sort: img.sort
          }))
        };
      })
    );

    // Cache the result for 60 seconds
    if (redisClient) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(productsWithImages), 'EX', 60);
      } catch (cacheErr) {
        console.warn('Cache write error:', cacheErr);
      }
    }

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.set('X-Cache', 'MISS');
    res.json(productsWithImages);
  } catch (err: any) {
    console.error('Get products error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/:slug', async (req: express.Request, res: express.Response) => {
  try {
    const { slug } = req.params;
    const cacheKey = `product:${slug}`;

    // Try cache first
    if (redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
          res.set('X-Cache', 'HIT');
          return res.json(JSON.parse(cached));
        }
      } catch (cacheErr) {
        console.warn('Cache read error:', cacheErr);
      }
    }

    const product = await Product.findOne({ slug }).lean();

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const images = await ProductImage.find({ product_id: product._id })
      .sort({ sort: 1 })
      .lean();

    const productWithImages = {
      ...product,
      id: product._id,
      images: images.map((img: any) => ({
        id: img._id,
        url: img.url,
        alt: img.alt,
        sort: img.sort
      }))
    };

    // Cache for 2 minutes
    if (redisClient) {
      try {
        await redisClient.set(cacheKey, JSON.stringify({ product: productWithImages }), 'EX', 120);
      } catch (cacheErr) {
        console.warn('Cache write error:', cacheErr);
      }
    }

    res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
    res.set('X-Cache', 'MISS');
    res.json({ product: productWithImages });
  } catch (err: any) {
    console.error('Get product error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// ============================================
// CLOUDINARY SIGNED UPLOAD
// ============================================

app.post('/api/uploads/sign', authenticateToken, requireAdmin, (req: express.Request, res: express.Response) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const { slug = 'product', uuid = Date.now().toString() } = req.body;
    const folder = `${process.env.CLOUDINARY_UPLOAD_FOLDER || 'poolbeanbags/products'}/${slug}/${uuid}`;
    const public_id = `${slug}-${uuid}`;
    
    // Cloudinary expects parameters in alphabetical order
    const paramsToSign = `folder=${folder}&public_id=${public_id}&timestamp=${timestamp}`;
    const signature = crypto
      .createHash('sha1')
      .update(paramsToSign + process.env.CLOUDINARY_API_SECRET)
      .digest('hex');
    
    res.json({
      timestamp,
      folder,
      public_id,
      signature,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME
    });
  } catch (err: any) {
    console.error('Sign upload error:', err?.message || err);
    res.status(500).json({ error: 'Failed to generate upload signature' });
  }
});

// ============================================
// PRODUCT CRUD
// ============================================

app.post('/api/admin/products', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { images, ...productData } = req.body;

    const product = await Product.create(productData);

    // Create product images
    if (images && images.length > 0) {
      await ProductImage.insertMany(
        images.map((img: any, index: number) => ({
          product_id: product._id,
          url: img.url,
          alt: img.alt || product.title,
          sort: img.sort || index
        }))
      );
    }

    res.status(201).json(product);
  } catch (err: any) {
    console.error('Create product error:', err?.message || err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/admin/products/:id', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { images, ...productData } = req.body;

    const product = await Product.findByIdAndUpdate(id, productData, { new: true });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Update images if provided
    if (images) {
      await ProductImage.deleteMany({ product_id: id });
      if (images.length > 0) {
        await ProductImage.insertMany(
          images.map((img: any, index: number) => ({
            product_id: id,
            url: img.url,
            alt: img.alt || product.title,
            sort: img.sort || index
          }))
        );
      }
    }

    // Invalidate cache for this product and product list
    if (redisClient) {
      try {
        await redisClient.del(`product:${product.slug}`);
        // Clear all product list cache keys (simple approach - delete pattern)
        const keys = await redisClient.keys('products:*');
        if (keys.length > 0) await redisClient.del(...keys);
      } catch (cacheErr) {
        console.warn('Cache invalidation error:', cacheErr);
      }
    }

    res.json(product);
  } catch (err: any) {
    console.error('Update product error:', err?.message || err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Add image to product
app.post('/api/admin/products/:id/images', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { url, alt, sort = 0 } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const image = await ProductImage.create({
      product_id: id,
      url,
      alt: alt || product.title,
      sort
    });

    res.json(image);
  } catch (err: any) {
    console.error('Add product image error:', err?.message || err);
    res.status(500).json({ error: 'Failed to add image' });
  }
});

app.delete('/api/admin/products/:id', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;

    await ProductImage.deleteMany({ product_id: id });
    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (err: any) {
    console.error('Delete product error:', err?.message || err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// =========================
// ANNOUNCEMENTS ROUTES
// =========================

app.get('/api/announcements', async (req: express.Request, res: express.Response) => {
  try {
    const { featured } = req.query;
    const query: any = {};

    if (featured === 'true') {
      query.is_featured = true;
    }

    // Only show published announcements to public
    query.published_at = { $lte: new Date() };

    const announcements = await Announcement.find(query).sort({ published_at: -1 });
    const formattedAnnouncements = announcements.map(announcement => ({
      id: announcement._id,
      slug: announcement.slug,
      title: announcement.title,
      excerpt: announcement.excerpt,
      body_richtext: announcement.body_richtext,
      banner_image: announcement.banner_image,
      banner_image_url: announcement.banner_image, // For compatibility
      published_at: announcement.published_at,
      start_at: announcement.start_at,
      end_at: announcement.end_at,
      is_featured: announcement.is_featured,
      created_at: (announcement as any).createdAt || (announcement as any).created_at
    }));
    res.json({ announcements: formattedAnnouncements });
  } catch (err: any) {
    console.error('Get announcements error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

app.get('/api/announcements/:slug', async (req: express.Request, res: express.Response) => {
  try {
    const { slug } = req.params;
    const announcement = await Announcement.findOne({ slug, published_at: { $lte: new Date() } });

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json(announcement);
  } catch (err: any) {
    console.error('Get announcement error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch announcement' });
  }
});

app.get('/api/admin/announcements', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const announcements = await Announcement.find().sort({ created_at: -1 });
    const formattedAnnouncements = announcements.map(announcement => ({
      id: announcement._id,
      slug: announcement.slug,
      title: announcement.title,
      excerpt: announcement.excerpt,
      body_richtext: announcement.body_richtext,
      banner_image: announcement.banner_image,
      published_at: announcement.published_at,
      start_at: announcement.start_at,
      end_at: announcement.end_at,
      is_featured: announcement.is_featured,
      created_at: (announcement as any).createdAt || (announcement as any).created_at
    }));
    res.json({ announcements: formattedAnnouncements });
  } catch (err: any) {
    console.error('Get admin announcements error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

app.post('/api/admin/announcements', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const announcementData = {
      ...req.body,
      published_at: req.body.published_at || new Date() // Set published_at to now if not provided
    };
    const announcement = await Announcement.create(announcementData);
    const formattedAnnouncement = {
      id: announcement._id,
      slug: announcement.slug,
      title: announcement.title,
      excerpt: announcement.excerpt,
      body_richtext: announcement.body_richtext,
      banner_image: announcement.banner_image,
      published_at: announcement.published_at,
      start_at: announcement.start_at,
      end_at: announcement.end_at,
      is_featured: announcement.is_featured,
      created_at: (announcement as any).createdAt || (announcement as any).created_at
    };
    res.status(201).json(formattedAnnouncement);
  } catch (err: any) {
    console.error('Create announcement error:', err?.message || err);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

app.put('/api/admin/announcements/:id', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findByIdAndUpdate(id, req.body, { new: true });

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    const formattedAnnouncement = {
      id: announcement._id,
      slug: announcement.slug,
      title: announcement.title,
      excerpt: announcement.excerpt,
      body_richtext: announcement.body_richtext,
      banner_image: announcement.banner_image,
      published_at: announcement.published_at,
      start_at: announcement.start_at,
      end_at: announcement.end_at,
      is_featured: announcement.is_featured,
      created_at: (announcement as any).createdAt || (announcement as any).created_at
    };

    res.json(formattedAnnouncement);
  } catch (err: any) {
    console.error('Update announcement error:', err?.message || err);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

app.delete('/api/admin/announcements/:id', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findByIdAndDelete(id);

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ message: 'Announcement deleted successfully' });
  } catch (err: any) {
    console.error('Delete announcement error:', err?.message || err);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// =========================
// ORDERS ROUTES
// =========================

app.get('/api/admin/orders', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { status, payment_status } = req.query;
    const query: any = {};

    if (status) query.status = status;
    if (payment_status) query.payment_status = payment_status;

    // Fetch orders from main Order collection
    const orders = await Order.find(query).sort({ created_at: -1 });
    
    // Fetch related data for each order and normalize fields for frontend
    const ordersWithDetails = await Promise.all(
      orders.map(async (order: any) => {
        const items = await OrderItem.find({ order_id: order._id });
        const delivery = await OrderDelivery.findOne({ order_id: order._id });

        let shippingAddress = null;
        let billingAddress = null;

        if (order.shipping_address_id) {
          shippingAddress = await Address.findById(order.shipping_address_id);
        }
        if (order.billing_address_id) {
          billingAddress = await Address.findById(order.billing_address_id);
        }

        const total = (order.total_cents !== undefined && order.total_cents !== null)
          ? (order.total_cents / 100)
          : (order.total || 0);

        // Build customer object from shipping/billing address
        let customerObj = null;
        if (shippingAddress) {
          customerObj = {
            name: `${shippingAddress.first_name} ${shippingAddress.last_name}`,
            email: shippingAddress.email,
            phone: shippingAddress.phone
          };
        } else if (billingAddress) {
          customerObj = {
            name: `${billingAddress.first_name} ${billingAddress.last_name}`,
            email: billingAddress.email,
            phone: billingAddress.phone
          };
        }

        return {
          id: order._id,
          orderNo: order.order_no,
          status: order.status || 'pending',
          paymentStatus: order.payment_status || 'pending',
          total,
          createdAt: order.createdAt || order.created_at || null,
          customer: customerObj,
          items,
          delivery,
          shipping_address: shippingAddress,
          billing_address: billingAddress,
          provider: 'legacy'
        };
      })
    );

    // Fetch PayFast orders
    const payfastQuery: any = {};
    if (status) payfastQuery.status = status;
    
    const payfastOrders = await PayfastOrder.find(payfastQuery).sort({ createdAt: -1 });
    
    const payfastOrdersNormalized = payfastOrders.map((order: any) => {
      return {
        id: order._id,
        orderNo: order.m_payment_id,
        status: order.status || 'pending',
        paymentStatus: order.payment_status || order.status || 'pending',
        total: (order.total_cents || 0) / 100,
        createdAt: order.createdAt,
        customer: order.customer ? {
          name: `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim(),
          email: order.customer.email_address,
          phone: order.shipping?.phone || ''
        } : null,
        items: order.items || [],
        delivery: null,
        shipping_address: order.shipping ? {
          address1: order.shipping.address1,
          city: order.shipping.city,
          province: order.shipping.province,
          postal_code: order.shipping.postalCode,
          phone: order.shipping.phone
        } : null,
        billing_address: null,
        provider: 'payfast'
      };
    });

    // Combine and sort by date
    const allOrders = [...ordersWithDetails, ...payfastOrdersNormalized]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ orders: allOrders });
  } catch (err: any) {
    console.error('Get orders error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/api/admin/orders/:id', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    
    // First try to find in legacy Order collection
    let order = await Order.findById(id);

    if (order) {
      const items = await OrderItem.find({ order_id: id });
      const delivery = await OrderDelivery.findOne({ order_id: id });
      
      let shippingAddress = null;
      let billingAddress = null;

      if (order.shipping_address_id) {
        shippingAddress = await Address.findById(order.shipping_address_id);
      }
      if (order.billing_address_id) {
        billingAddress = await Address.findById(order.billing_address_id);
      }

      return res.json({
        ...order.toObject(),
        items,
        delivery,
        shipping_address: shippingAddress,
        billing_address: billingAddress,
        provider: 'legacy'
      });
    }

    // Try PayFast orders
    const payfastOrder = await PayfastOrder.findById(id);
    
    if (payfastOrder) {
      const orderData = payfastOrder.toObject() as any;
      return res.json({
        _id: orderData._id,
        id: orderData._id,
        order_no: orderData.m_payment_id,
        orderNo: orderData.m_payment_id,
        status: orderData.status || 'pending',
        payment_status: orderData.payment_status || orderData.status || 'pending',
        paymentStatus: orderData.payment_status || orderData.status || 'pending',
        total: (orderData.total_cents || 0) / 100,
        total_cents: orderData.total_cents,
        subtotal_cents: orderData.subtotal_cents,
        shipping_cents: orderData.shipping_cents,
        discount_cents: orderData.discount_cents,
        created_at: orderData.createdAt,
        createdAt: orderData.createdAt,
        customer: orderData.customer ? {
          first_name: orderData.customer.first_name,
          last_name: orderData.customer.last_name,
          email: orderData.customer.email_address,
          email_address: orderData.customer.email_address,
          name: `${orderData.customer.first_name || ''} ${orderData.customer.last_name || ''}`.trim(),
          phone: orderData.shipping?.phone || ''
        } : null,
        items: orderData.items || [],
        delivery: null,
        shipping_address: orderData.shipping ? {
          type: orderData.shipping.type,
          address1: orderData.shipping.address1,
          address_1: orderData.shipping.address1,
          city: orderData.shipping.city,
          province: orderData.shipping.province,
          postal_code: orderData.shipping.postalCode,
          postalCode: orderData.shipping.postalCode,
          phone: orderData.shipping.phone
        } : null,
        billing_address: null,
        provider: 'payfast',
        gateway_txn_id: orderData.gateway_txn_id,
        gateway_status: orderData.gateway_status
      });
    }

    // Try Ozow orders
    const ozowOrder = await OzowOrder.findById(id);
    
    if (ozowOrder) {
      const orderData = ozowOrder.toObject() as any;
      return res.json({
        _id: orderData._id,
        id: orderData._id,
        order_no: orderData.m_payment_id,
        orderNo: orderData.m_payment_id,
        status: orderData.status || 'pending',
        payment_status: orderData.status === 'paid' ? 'paid' : 'pending',
        paymentStatus: orderData.status === 'paid' ? 'paid' : 'pending',
        total: (orderData.total_cents || 0) / 100,
        total_cents: orderData.total_cents,
        subtotal_cents: orderData.subtotal_cents,
        shipping_cents: orderData.shipping_cents,
        discount_cents: orderData.discount_cents,
        created_at: orderData.createdAt,
        createdAt: orderData.createdAt,
        customer: orderData.customer ? {
          first_name: orderData.customer.first_name,
          last_name: orderData.customer.last_name,
          email: orderData.customer.email_address,
          email_address: orderData.customer.email_address,
          name: `${orderData.customer.first_name || ''} ${orderData.customer.last_name || ''}`.trim(),
          phone: orderData.shipping?.phone || ''
        } : null,
        items: orderData.items || [],
        delivery: null,
        shipping: orderData.shipping,
        shipping_address: orderData.shipping ? {
          type: orderData.shipping.type,
          address1: orderData.shipping.address1,
          address_1: orderData.shipping.address1,
          city: orderData.shipping.city,
          province: orderData.shipping.province,
          postal_code: orderData.shipping.postalCode,
          postalCode: orderData.shipping.postalCode,
          phone: orderData.shipping.phone
        } : null,
        billing_address: null,
        provider: 'ozow',
        gateway_txn_id: orderData.gateway_txn_id,
        gateway_status: orderData.gateway_status
      });
    }

    return res.status(404).json({ error: 'Order not found' });
  } catch (err: any) {
    console.error('Get order error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Invoice generation endpoint
app.get('/api/admin/orders/:id/invoice', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    let order: any = await Order.findById(req.params.id);
    if (!order) {
        order = await PayfastOrder.findById(req.params.id);
    }
    if (!order) {
        order = await OzowOrder.findById(req.params.id);
    }
    
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Normalize Items
    let items: any[] = [];
    if (order.items && order.items.length > 0 && (order.items[0].title || order.items[0].productId)) {
         items = order.items.map((item: any) => ({
            product_title: item.title || 'Product',
            quantity: item.quantity || 1,
            unit_price_cents: item.price || 0,
            total_price_cents: (item.price || 0) * (item.quantity || 1)
        }));
    } else {
        items = await OrderItem.find({ order_id: order._id });
    }

    // Normalize Delivery & Address
    let delivery = order.delivery;
    let shippingAddr: any = order.shipping_address_id ? await Address.findById(order.shipping_address_id) : null;
    let billingAddr: any = order.billing_address_id ? await Address.findById(order.billing_address_id) : null;

    // Handle Ozow/PayFast style shipping
    if (!delivery && order.shipping) {
        delivery = {
            delivery_method: order.shipping.type === 'pickup' ? 'pickup' : 'shipping',
            delivery_status: order.status === 'delivered' ? 'delivered' : 'pending',
            tracking_number: order.shipping.trackingNumber
        };
        
        if (order.shipping.type !== 'pickup') {
             shippingAddr = {
                first_name: order.customer?.first_name || order.customer?.name?.split(' ')[0] || '',
                last_name: order.customer?.last_name || order.customer?.name?.split(' ').slice(1).join(' ') || '',
                address_line_1: order.shipping.address1,
                address_line_2: order.shipping.address2,
                city: order.shipping.city,
                state: order.shipping.province,
                postal_code: order.shipping.postalCode,
                country: 'South Africa',
                phone: order.shipping.phone,
                email: order.customer?.email_address || order.customer?.email
            };
        }
    }

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.order_no}.pdf`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).text('POOL BEANBAGS', { align: 'center' });
    doc.fontSize(10).text('Invoice', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Order #: ${order.order_no || order.m_payment_id}`);
    doc.text(`Date: ${new Date(order.created_at || order.createdAt).toLocaleDateString()}`);
    doc.text(`Status: ${(order.status || 'pending').toUpperCase()}`);
    doc.text(`Payment: ${(order.payment_status || order.status || 'pending').toUpperCase()}`);
    doc.moveDown();

    // Delivery Info
    doc.fontSize(14).text('Delivery Information', { underline: true });
    doc.fontSize(10);
    if (delivery) {
      if (delivery.delivery_method === 'shipping') {
        doc.text(`Method: Shipping (${delivery.delivery_status})`);
        if (delivery.tracking_number) doc.text(`Tracking: ${delivery.tracking_number}`);
        doc.moveDown();
        if (shippingAddr) {
          doc.fontSize(12).text('Shipping Address:', { underline: true });
          doc.fontSize(10).text(`${shippingAddr.first_name} ${shippingAddr.last_name}`);
          doc.text(shippingAddr.address_line_1);
          if (shippingAddr.address_line_2) doc.text(shippingAddr.address_line_2);
          doc.text(`${shippingAddr.city}, ${shippingAddr.state || ''} ${shippingAddr.postal_code}`);
          doc.text(shippingAddr.country);
          doc.text(`Phone: ${shippingAddr.phone}`);
          doc.text(`Email: ${shippingAddr.email}`);
        }
      } else {
        doc.text('Method: Pickup from Store');
        if (delivery.pickup_date) doc.text(`Pickup Date: ${new Date(delivery.pickup_date).toLocaleDateString()}`);
        if (delivery.pickup_time) doc.text(`Pickup Time: ${delivery.pickup_time}`);
        doc.moveDown();
        if (billingAddr) {
          doc.fontSize(12).text('Customer Information:', { underline: true });
          doc.fontSize(10).text(`${billingAddr.first_name} ${billingAddr.last_name}`);
          doc.text(`Phone: ${billingAddr.phone}`);
          doc.text(`Email: ${billingAddr.email}`);
        }
      }
    }
    doc.moveDown();

    // Items
    doc.fontSize(14).text('Order Items', { underline: true });
    doc.moveDown(0.5);
    const tableTop = doc.y;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Item', 50, tableTop);
    doc.text('Qty', 300, tableTop);
    doc.text('Price', 360, tableTop);
    doc.text('Total', 450, tableTop);
    doc.font('Helvetica');
    let yPos = tableTop + 20;
    items.forEach((item: any) => {
      doc.text(item.product_title, 50, yPos, { width: 240 });
      doc.text(item.quantity.toString(), 300, yPos);
      doc.text(`R${(item.unit_price_cents / 100).toFixed(2)}`, 360, yPos);
      doc.text(`R${(item.total_price_cents / 100).toFixed(2)}`, 450, yPos);
      yPos += 25;
    });

    // Totals
    yPos += 10;
    doc.moveTo(50, yPos).lineTo(550, yPos).stroke();
    yPos += 15;
    doc.text('Subtotal:', 360, yPos);
    doc.text(`R${(order.subtotal_cents / 100).toFixed(2)}`, 450, yPos);
    yPos += 20;
    if (order.shipping_cents > 0) {
      doc.text('Shipping:', 360, yPos);
      doc.text(`R${(order.shipping_cents / 100).toFixed(2)}`, 450, yPos);
      yPos += 20;
    }
    doc.font('Helvetica-Bold');
    doc.text('Total:', 360, yPos);
    doc.text(`R${(order.total_cents / 100).toFixed(2)}`, 450, yPos);

    doc.fontSize(8).font('Helvetica').text('Thank you for your business!', 50, doc.page.height - 50, { align: 'center' });
    doc.end();
  } catch (err: any) {
    console.error('Invoice error:', err);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

// Public: fetch a single order by id (used by order-confirmation page)
app.get('/api/orders/:id', async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = await OrderItem.find({ order_id: id });
    const delivery = await OrderDelivery.findOne({ order_id: id });

    const shippingAddress = order.shipping_address_id ? await Address.findById(order.shipping_address_id) : null;
    const billingAddress = order.billing_address_id ? await Address.findById(order.billing_address_id) : null;

    // Normalize totals so frontend can render (frontend expects order.total to exist)
    const total = (order as any).total_cents ? (order as any).total_cents / 100 : ((order as any).total || 0);

    const publicOrder = {
      id: order._id,
      orderNo: order.order_no,
      status: order.status,
      total,
      createdAt: order.created_at,
      items,
      delivery: delivery || null,
      shipping_address: shippingAddress || null,
      billing_address: billingAddress || null
    };

    res.json({ order: publicOrder });
  } catch (err: any) {
    console.error('Get public order error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

app.post('/api/orders', async (req: express.Request, res: express.Response) => {
  try {
    const { items, shipping_address, billing_address, delivery_info, ...orderData } = req.body;

    // Create addresses
    let shippingAddressId = null;
    let billingAddressId = null;

    if (shipping_address) {
      const addr = await Address.create(shipping_address);
      shippingAddressId = addr._id;
    }

    if (billing_address) {
      const addr = await Address.create(billing_address);
      billingAddressId = addr._id;
    }

    // Generate order number
    const orderNo = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create order with defaults
    const order = await Order.create({
      order_no: orderNo,
      email: orderData.email || orderData.customer_email,
      status: orderData.status || 'pending',
      payment_status: orderData.payment_status || 'pending',
      subtotal_cents: orderData.subtotal_cents || 0,
      shipping_cents: orderData.shipping_cents || 0,
      discount_cents: orderData.discount_cents || 0,
      tax_cents: orderData.tax_cents || 0,
      total_cents: orderData.total_cents || 0,
      shipping_address_id: shippingAddressId,
      billing_address_id: billingAddressId,
      gateway: orderData.gateway || 'ozow',
      gateway_ref: orderData.gateway_ref
    });

    // Create delivery information if provided
    let delivery = null;
    if (delivery_info) {
      delivery = await OrderDelivery.create({
        order_id: order._id,
        delivery_method: delivery_info.delivery_method || delivery_info.method,
        pickup_date: delivery_info.pickup_date,
        pickup_time: delivery_info.pickup_time,
        shipping_address_id: delivery_info.delivery_method === 'shipping' ? shippingAddressId : undefined,
        tracking_number: delivery_info.tracking_number,
        delivery_status: delivery_info.delivery_status || 'pending',
        notes: delivery_info.notes
      });
    }

    // Create order items
    if (items && items.length > 0) {
      const resolvedItems: any[] = [];

      for (const item of items) {
        const raw = item.product_id || item.productId || item.id || item.product_slug || item.slug;
        let resolvedProductId: string | null = null;
        let productRecord: any = null;

        if (raw && typeof raw === 'string') {
          // if already looks like an ObjectId, use it
          if (raw.length === 24) {
            resolvedProductId = raw;
            productRecord = await Product.findById(raw).lean();
          } else {
            // try resolving by slug or alternate id fields
            productRecord = await Product.findOne({ $or: [{ slug: raw }, { id: raw }] }).lean();
            if (productRecord) resolvedProductId = productRecord._id.toString();
          }
        }

        if (resolvedProductId) {
          const unitPrice = item.unit_price_cents || item.price || productRecord?.base_price_cents || 0;
          const qty = item.quantity || 1;
          const totalPrice = item.total_price_cents || (qty * unitPrice);

          resolvedItems.push({
            order_id: order._id,
            product_id: resolvedProductId,
            product_slug: productRecord?.slug || item.product_slug || item.slug || 'unknown',
            product_title: productRecord?.title || item.product_title || item.title || 'Product',
            quantity: qty,
            unit_price_cents: unitPrice,
            total_price_cents: totalPrice,
            fabric: item.fabric
          });
        }
      }

      if (resolvedItems.length === 0) {
        // Return 400 with details so frontend can show a helpful message and debug
        return res.status(400).json({ error: 'No valid products in cart', itemsReceived: items });
      }

      const inserted = await OrderItem.insertMany(resolvedItems);

      // Compute subtotal and update order totals if not already set
      const subtotalCents = inserted.reduce((sum: number, it: any) => sum + (it.total_price_cents || 0), 0);
      if (!orderData.subtotal_cents && !orderData.total_cents) {
        await Order.findByIdAndUpdate(order._id, { 
          subtotal_cents: subtotalCents, 
          total_cents: subtotalCents + (orderData.shipping_cents || 0)
        });
      }
    }

    // Return the response shape the frontend expects
    res.status(201).json({ order: { id: order._id, orderNo } });
  } catch (err: any) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'Failed to create order', details: err.message });
  }
});

app.put('/api/admin/orders/:id', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const order = await Order.findByIdAndUpdate(id, req.body, { new: true });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(order);
  } catch (err: any) {
    console.error('Update order error:', err?.message || err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

app.put('/api/admin/orders/:id/status', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Try legacy Order
    let order = await Order.findByIdAndUpdate(id, { status }, { new: true });

    if (order) {
        return res.json(order);
    }

    // Try PayFast Order
    const payfastOrder = await PayfastOrder.findByIdAndUpdate(id, { status }, { new: true });
    if (payfastOrder) {
        return res.json(payfastOrder);
    }

    // Try Ozow Order
    const ozowOrder = await OzowOrder.findByIdAndUpdate(id, { status }, { new: true });
    if (ozowOrder) {
        return res.json(ozowOrder);
    }

    return res.status(404).json({ error: 'Order not found' });
  } catch (err: any) {
    console.error('Update order status error:', err?.message || err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

app.put('/api/admin/orders/:id/delivery', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const { deliveryStatus, trackingNumber, notes } = req.body;

    // Find the order first
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if delivery document exists
    let delivery = await OrderDelivery.findOne({ order_id: id });
    
    if (!delivery) {
      // Create delivery document if it doesn't exist
      delivery = await OrderDelivery.create({
        order_id: id,
        delivery_method: 'shipping', // Assume shipping since this is the shipping page
        delivery_status: deliveryStatus || 'pending',
        tracking_number: trackingNumber,
        notes: notes
      });
    } else {
      // Update existing delivery document
      delivery = await OrderDelivery.findOneAndUpdate(
        { order_id: id },
        {
          delivery_status: deliveryStatus,
          tracking_number: trackingNumber,
          notes: notes
        },
        { new: true }
      );
    }

    res.json({ delivery });
  } catch (err: any) {
    console.error('Update delivery error:', err?.message || err);
    res.status(500).json({ error: 'Failed to update delivery status', details: err.message });
  }
});

// =========================
// CONTACTS ROUTES
// =========================

app.get('/api/admin/contacts', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const contacts = await Contact.find().sort({ created_at: -1 });
    res.json(contacts);
  } catch (err: any) {
    console.error('Get contacts error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

app.post('/api/contacts', async (req: express.Request, res: express.Response) => {
  try {
    const contact = await Contact.create(req.body);
    res.status(201).json(contact);
  } catch (err: any) {
    console.error('Create contact error:', err?.message || err);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

app.put('/api/admin/contacts/:id', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const contact = await Contact.findByIdAndUpdate(id, req.body, { new: true });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(contact);
  } catch (err: any) {
    console.error('Update contact error:', err?.message || err);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

app.delete('/api/admin/contacts/:id', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const contact = await Contact.findByIdAndDelete(id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ message: 'Contact deleted successfully' });
  } catch (err: any) {
    console.error('Delete contact error:', err?.message || err);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// =========================
// DELETE ORDER
// =========================

app.delete('/api/admin/orders/:id', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    
    // Try legacy Order first
    const order = await Order.findById(id);

    if (order) {
      // Delete associated items and delivery
      await OrderItem.deleteMany({ order_id: id });
      await OrderDelivery.deleteMany({ order_id: id });
      await Order.findByIdAndDelete(id);
      return res.json({ message: 'Order deleted successfully' });
    }

    // Try PayFast order
    const payfastOrder = await PayfastOrder.findById(id);
    
    if (payfastOrder) {
      await PayfastOrder.findByIdAndDelete(id);
      return res.json({ message: 'Order deleted successfully' });
    }

    // Try Ozow order
    const ozowOrder = await OzowOrder.findById(id);
    
    if (ozowOrder) {
      await OzowOrder.findByIdAndDelete(id);
      return res.json({ message: 'Order deleted successfully' });
    }

    return res.status(404).json({ error: 'Order not found' });
  } catch (err: any) {
    console.error('Delete order error:', err?.message || err);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// =========================
// PDF INVOICE GENERATION
// =========================

app.get('/api/admin/orders/:id/invoice', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    
    // Try legacy Order first
    const order = await Order.findById(id);

    if (order) {
      const items = await OrderItem.find({ order_id: id });
      const shippingAddress = order.shipping_address_id 
        ? await Address.findById(order.shipping_address_id) 
        : null;

      const doc = new PDFDocument();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.order_no}.pdf`);
      
      doc.pipe(res);

      // Header
      doc.fontSize(20).text('INVOICE', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Order #: ${order.order_no}`);
      doc.text(`Date: ${order.created_at.toLocaleDateString()}`);
      doc.text(`Status: ${order.status}`);
      doc.moveDown();

      // Shipping address
      if (shippingAddress) {
        doc.text('Ship To:');
        doc.text(`${shippingAddress.first_name} ${shippingAddress.last_name}`);
        doc.text(shippingAddress.address_line_1);
        if (shippingAddress.address_line_2) doc.text(shippingAddress.address_line_2);
        doc.text(`${shippingAddress.city}, ${shippingAddress.postal_code}`);
        doc.moveDown();
      }

      // Items
      doc.text('Items:', { underline: true });
      items.forEach((item: any) => {
        doc.text(`${item.product_title} x${item.quantity} - R${(item.total_price_cents / 100).toFixed(2)}`);
      });
      doc.moveDown();

      // Totals
      doc.text(`Subtotal: R${(order.subtotal_cents / 100).toFixed(2)}`);
      doc.text(`Shipping: R${(order.shipping_cents / 100).toFixed(2)}`);
      doc.text(`Tax: R${(order.tax_cents / 100).toFixed(2)}`);
      doc.fontSize(14);
      doc.text(`Total: R${(order.total_cents / 100).toFixed(2)}`);

      doc.end();
      return;
    }

    // Try PayFast order
    const payfastOrder = await PayfastOrder.findById(id);
    
    if (payfastOrder) {
      const orderData = payfastOrder.toObject() as any;
      
      const doc = new PDFDocument();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=invoice-${orderData.m_payment_id}.pdf`);
      
      doc.pipe(res);

      // Header
      doc.fontSize(20).text('INVOICE', { align: 'center' });
      doc.fontSize(10).text('Pool Beanbags', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Order #: ${orderData.m_payment_id}`);
      doc.text(`Date: ${new Date(orderData.createdAt).toLocaleDateString()}`);
      doc.text(`Status: ${orderData.status}`);
      doc.text(`Payment: ${orderData.payment_status || orderData.status}`);
      doc.moveDown();

      // Customer info
      if (orderData.customer) {
        doc.text('Customer:');
        doc.text(`${orderData.customer.first_name || ''} ${orderData.customer.last_name || ''}`);
        if (orderData.customer.email_address) doc.text(orderData.customer.email_address);
        doc.moveDown();
      }

      // Shipping address
      if (orderData.shipping && orderData.shipping.type === 'delivery') {
        doc.text('Ship To:');
        if (orderData.shipping.address1) doc.text(orderData.shipping.address1);
        doc.text(`${orderData.shipping.city || ''}, ${orderData.shipping.province || ''} ${orderData.shipping.postalCode || ''}`);
        if (orderData.shipping.phone) doc.text(`Phone: ${orderData.shipping.phone}`);
        doc.moveDown();
      } else if (orderData.shipping?.type === 'pickup') {
        doc.text('Delivery: Pickup');
        doc.moveDown();
      }

      // Items
      doc.text('Items:', { underline: true });
      (orderData.items || []).forEach((item: any) => {
        const itemPrice = (item.price || 0) / 100;
        const lineTotal = itemPrice * (item.quantity || 1);
        doc.text(`${item.title || 'Product'} x${item.quantity || 1} - R${lineTotal.toFixed(2)}`);
        if (item.fabric) doc.fontSize(10).text(`  Fabric: ${item.fabric}`).fontSize(12);
      });
      doc.moveDown();

      // Totals
      doc.text(`Subtotal: R${((orderData.subtotal_cents || 0) / 100).toFixed(2)}`);
      doc.text(`Shipping: R${((orderData.shipping_cents || 0) / 100).toFixed(2)}`);
      if (orderData.discount_cents) {
        doc.text(`Discount: -R${((orderData.discount_cents || 0) / 100).toFixed(2)}`);
      }
      doc.fontSize(14);
      doc.text(`Total: R${((orderData.total_cents || 0) / 100).toFixed(2)}`);

      doc.end();
      return;
    }

    return res.status(404).json({ error: 'Order not found' });
  } catch (err: any) {
    console.error('Invoice generation error:', err?.message || err);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

// =========================
// START SERVER
// =========================

app.listen(port, async () => {
  console.log(`\nðŸš€ Backend listening on http://localhost:${port}`);
  console.log(`ðŸ“Š MongoDB Atlas connection: ${process.env.MONGODB_URI ? 'âœ“' : 'âœ—'}`);
  console.log(`â˜ï¸  Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME || 'Not configured'}`);
  console.log(`ðŸ”’ CORS: Allowing all origins\n`);
  
  await seedAdminUser();
});
