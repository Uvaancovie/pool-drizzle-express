const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
require('dotenv').config();

// Simple User schema
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

async function createAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, { 
      dbName: process.env.DB_NAME || 'poolbeanbags'
    });
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@poolbeanbags.co.za' });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists with email: admin@poolbeanbags.co.za');
      console.log('Delete it first if you want to recreate it.');
      process.exit(0);
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    // Create admin user
    const admin = await User.create({
      email: 'admin@poolbeanbags.co.za',
      password: hashedPassword,
      role: 'admin'
    });

    console.log('\n✅ Admin user created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email:    admin@poolbeanbags.co.za');
    console.log('🔑 Password: admin123');
    console.log('👤 Role:     admin');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('⚠️  IMPORTANT: Change this password after first login!');
    
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

createAdmin();
