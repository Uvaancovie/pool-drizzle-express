import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
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

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(bodyParser.json());

// Configure CORS
app.use(cors({
  origin: true,
  credentials: true,
  optionsSuccessStatus: 200,
}));

app.options('*', cors());

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

    const products = await Product.find(query).sort({ created_at: -1 });
    
    // Fetch images for each product
    const productsWithImages = await Promise.all(
      products.map(async (product: any) => {
        const images = await ProductImage.find({ product_id: product._id }).sort({ sort: 1 });
        return {
          ...product.toObject(),
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

    res.json(productsWithImages);
  } catch (err: any) {
    console.error('Get products error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/products/:slug', async (req: express.Request, res: express.Response) => {
  try {
    const { slug } = req.params;
    const product = await Product.findOne({ slug });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const images = await ProductImage.find({ product_id: product._id }).sort({ sort: 1 });

    res.json({
      ...product.toObject(),
      id: product._id, // Add id alias
      images: images.map((img: any) => ({
        id: img._id,
        url: img.url,
        alt: img.alt,
        sort: img.sort
      }))
    });
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
    res.json(announcements);
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
    res.json(announcements);
  } catch (err: any) {
    console.error('Get admin announcements error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

app.post('/api/admin/announcements', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const announcement = await Announcement.create(req.body);
    res.status(201).json(announcement);
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

    res.json(announcement);
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

        const customer = order.customer_name || order.customer_email || order.customer || null;

        return {
          id: order._id,
          orderNo: order.order_no,
          status: order.status,
          payment_status: order.payment_status,
          total,
          createdAt: order.created_at || order.createdAt || null,
          customer: customer,
          items,
          delivery,
          shipping_address: shippingAddress,
          billing_address: billingAddress
        };
      })
    );

    res.json({ orders: ordersWithDetails });
  } catch (err: any) {
    console.error('Get orders error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/api/admin/orders/:id', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

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

    res.json({
      ...order.toObject(),
      items,
      delivery,
      shipping_address: shippingAddress,
      billing_address: billingAddress
    });
  } catch (err: any) {
    console.error('Get order error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch order' });
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
      status: orderData.status || 'pending',
      payment_status: orderData.payment_status || 'unpaid',
      total_cents: orderData.total_cents || 0,
      shipping_address_id: shippingAddressId,
      billing_address_id: billingAddressId,
      customer_email: orderData.customer_email,
      customer_name: orderData.customer_name
    });

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
            total_price_cents: totalPrice
          });
        }
      }

      if (resolvedItems.length === 0) {
        // Return 400 with details so frontend can show a helpful message and debug
        return res.status(400).json({ error: 'No valid products in cart', itemsReceived: items });
      }

      const inserted = await OrderItem.insertMany(resolvedItems);

      // Compute subtotal and update order totals (assume no shipping/tax for now)
      const subtotalCents = inserted.reduce((sum: number, it: any) => sum + (it.total_price_cents || 0), 0);
      await Order.findByIdAndUpdate(order._id, { subtotal_cents: subtotalCents, total_cents: subtotalCents });
    }

    // Create delivery info
    if (delivery_info) {
      await OrderDelivery.create({
        order_id: order._id,
        method: delivery_info.method || 'standard',
        ...delivery_info
      });
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
// PDF INVOICE GENERATION
// =========================

app.get('/api/admin/orders/:id/invoice', authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

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
