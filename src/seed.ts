import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { 
  User, 
  Product, 
  ProductImage, 
  Announcement 
} from './db/models';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seed...\n');

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB Atlas\n');

    // Clear existing data
    console.log('🗑️  Clearing existing data...');
    await User.deleteMany({});
    await Product.deleteMany({});
    await ProductImage.deleteMany({});
    await Announcement.deleteMany({});
    console.log('✓ Cleared existing data\n');

    // 1. Create Admin User
    console.log('👤 Creating admin user...');
    const hashedPassword = await bcrypt.hash('password', 10);
    const admin = await User.create({
      email: 'admin@poolbeanbags.com',
      password_hash: hashedPassword,
      role: 'admin',
      first_name: 'Admin',
      last_name: 'User'
    });
    console.log(`✓ Admin user created: ${admin.email}\n`);

    // 2. Create Sample Products
    console.log('🎒 Creating sample products...');
    
    const product1 = await Product.create({
      slug: 'classic-pool-beanbag-blue',
      title: 'Classic Pool Beanbag - Ocean Blue',
      description: 'Our classic pool beanbag in ocean blue. Perfect for lounging by the pool. Made with UV-resistant, waterproof fabric that floats on water. Incredibly comfortable and durable.',
      status: 'active',
      base_price_cents: 89900, // R899.00
      is_promotional: true,
      promotion_text: 'Summer Special!',
      promotion_discount_percent: 15,
      seo_title: 'Classic Pool Beanbag - Ocean Blue | Pool Beanbags',
      seo_description: 'Relax in style with our Classic Pool Beanbag in Ocean Blue. UV-resistant, waterproof, and incredibly comfortable.'
    });

    await ProductImage.create({
      product_id: product1._id,
      url: 'https://res.cloudinary.com/dir468aeq/image/upload/v1/poolbeanbags/products/sample-blue-beanbag.jpg',
      alt: 'Classic Pool Beanbag - Ocean Blue',
      sort: 0
    });

    const product2 = await Product.create({
      slug: 'deluxe-pool-beanbag-pink',
      title: 'Deluxe Pool Beanbag - Sunset Pink',
      description: 'Luxury pool beanbag in stunning sunset pink. Extra large size with premium filling for maximum comfort. UV-resistant, water proof, and built to last seasons.',
      status: 'active',
      base_price_cents: 119900, // R1,199.00
      is_promotional: false,
      seo_title: 'Deluxe Pool Beanbag - Sunset Pink | Pool Beanbags',
      seo_description: 'Experience luxury with our Deluxe Pool Beanbag in Sunset Pink. Extra large, premium quality, perfect for poolside relaxation.'
    });

    await ProductImage.create({
      product_id: product2._id,
      url: 'https://res.cloudinary.com/dir468aeq/image/upload/v1/poolbeanbags/products/sample-pink-beanbag.jpg',
      alt: 'Deluxe Pool Beanbag - Sunset Pink',
      sort: 0
    });

    const product3 = await Product.create({
      slug: 'kids-pool-beanbag-green',
      title: 'Kids Pool Beanbag - Lime Green',
      description: 'Fun-sized pool beanbag perfect for kids! Bright lime green color, lightweight, and safe. Made with child-friendly materials and easy to carry.',
      status: 'active',
      base_price_cents: 59900, // R599.00
      is_promotional: true,
      promotion_text: 'Perfect for Kids!',
      promotion_discount_percent: 10,
      seo_title: 'Kids Pool Beanbag - Lime Green | Pool Beanbags',
      seo_description: 'Fun and safe pool beanbag for kids in bright lime green. Lightweight, durable, and perfect for young swimmers.'
    });

    await ProductImage.create({
      product_id: product3._id,
      url: 'https://res.cloudinary.com/dir468aeq/image/upload/v1/poolbeanbags/products/sample-green-beanbag.jpg',
      alt: 'Kids Pool Beanbag - Lime Green',
      sort: 0
    });

    const product4 = await Product.create({
      slug: 'premium-pool-beanbag-black',
      title: 'Premium Pool Beanbag - Matte Black',
      description: 'Sleek and sophisticated matte black pool beanbag. Premium quality materials, ergonomic design, and ultimate comfort. Perfect for modern pool areas.',
      status: 'active',
      base_price_cents: 139900, // R1,399.00
      is_promotional: false,
      seo_title: 'Premium Pool Beanbag - Matte Black | Pool Beanbags',
      seo_description: 'Sophisticated matte black pool beanbag with premium quality and ergonomic design. The ultimate in poolside luxury.'
    });

    await ProductImage.create({
      product_id: product4._id,
      url: 'https://res.cloudinary.com/dir468aeq/image/upload/v1/poolbeanbags/products/sample-black-beanbag.jpg',
      alt: 'Premium Pool Beanbag - Matte Black',
      sort: 0
    });

    const product5 = await Product.create({
      slug: 'double-pool-beanbag-white',
      title: 'Double Pool Beanbag - Pure White',
      description: 'Extra-wide pool beanbag perfect for two! Pure white color, spacious design, and premium comfort. Great for couples or lounging with friends.',
      status: 'active',
      base_price_cents: 159900, // R1,599.00
      is_promotional: true,
      promotion_text: 'Great for Couples!',
      promotion_discount_percent: 20,
      seo_title: 'Double Pool Beanbag - Pure White | Pool Beanbags',
      seo_description: 'Spacious double pool beanbag in pure white. Perfect for couples or sharing with friends. Premium comfort and style.'
    });

    await ProductImage.create({
      product_id: product5._id,
      url: 'https://res.cloudinary.com/dir468aeq/image/upload/v1/poolbeanbags/products/sample-white-beanbag.jpg',
      alt: 'Double Pool Beanbag - Pure White',
      sort: 0
    });

    console.log(`✓ Created 5 products\n`);

    // 3. Create Sample Announcements
    console.log('📢 Creating sample announcements...');

    await Announcement.create({
      slug: 'summer-sale-2025',
      title: 'Summer Sale - Up to 20% Off!',
      excerpt: 'Get ready for summer with our biggest sale of the year. Up to 20% off all pool beanbags!',
      body_richtext: '<h2>Summer is Here!</h2><p>Celebrate the sunny season with our exclusive summer sale. Save up to 20% on all our pool beanbags. Limited time only!</p><ul><li>Free shipping on orders over R1000</li><li>All products in stock</li><li>Sale ends October 31st</li></ul>',
      banner_image: 'https://res.cloudinary.com/dir468aeq/image/upload/v1/poolbeanbags/banners/summer-sale.jpg',
      published_at: new Date('2025-10-01'),
      start_at: new Date('2025-10-01'),
      end_at: new Date('2025-10-31'),
      is_featured: true
    });

    await Announcement.create({
      slug: 'new-collection-launch',
      title: 'New Collection Launch - Premium Range',
      excerpt: 'Introducing our new premium collection with enhanced comfort and style.',
      body_richtext: '<h2>Premium Collection Now Available</h2><p>We\'re excited to announce the launch of our premium pool beanbag collection. Featuring enhanced materials, better durability, and unmatched comfort.</p>',
      banner_image: 'https://res.cloudinary.com/dir468aeq/image/upload/v1/poolbeanbags/banners/premium-collection.jpg',
      published_at: new Date('2025-09-15'),
      is_featured: false
    });

    console.log(`✓ Created 2 announcements\n`);

    // Summary
    console.log('✅ Database seeding complete!\n');
    console.log('Summary:');
    console.log(`  - Admin user: admin@poolbeanbags.com / password`);
    console.log(`  - Products: 5`);
    console.log(`  - Announcements: 2`);
    console.log('\n🎉 Ready to start the server!\n');

    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB\n');
    
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  }
}

seedDatabase();
