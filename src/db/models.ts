import mongoose, { Schema, Document } from 'mongoose';

// =========================
// INTERFACES
// =========================

export interface IUser extends Document {
  email: string;
  password_hash: string;
  role: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  created_at: Date;
  updated_at: Date;
}

export interface IProduct extends Document {
  slug: string;
  title: string;
  description?: string;
  status: string;
  base_price_cents: number;
  is_promotional: boolean;
  promotion_text?: string;
  promotion_discount_percent?: number;
  seo_title?: string;
  seo_description?: string;
  created_at: Date;
  updated_at: Date;
}

export interface IProductImage extends Document {
  product_id: mongoose.Types.ObjectId;
  url: string;
  alt: string;
  sort: number;
  created_at: Date;
}

export interface IAnnouncement extends Document {
  slug: string;
  title: string;
  excerpt?: string;
  body_richtext?: string;
  banner_image?: string;
  published_at?: Date;
  start_at?: Date;
  end_at?: Date;
  is_featured: boolean;
  created_at: Date;
}

export interface IAddress extends Document {
  user_id?: mongoose.Types.ObjectId;
  type: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country: string;
  created_at: Date;
}

export interface IOrder extends Document {
  order_no: string;
  user_id?: mongoose.Types.ObjectId;
  email?: string;
  status: string;
  payment_status: string;
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  shipping_address_id?: mongoose.Types.ObjectId;
  billing_address_id?: mongoose.Types.ObjectId;
  gateway: string;
  gateway_ref?: string;
  created_at: Date;
}

export interface IOrderItem extends Document {
  order_id: mongoose.Types.ObjectId;
  product_id: mongoose.Types.ObjectId;
  product_variant_id?: mongoose.Types.ObjectId;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  product_title: string;
  product_slug: string;
  created_at: Date;
}

export interface IOrderDelivery extends Document {
  order_id: mongoose.Types.ObjectId;
  delivery_method: string;
  pickup_date?: Date;
  pickup_time?: string;
  shipping_address_id?: mongoose.Types.ObjectId;
  tracking_number?: string;
  delivery_status: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface IContact extends Document {
  name: string;
  email: string;
  phone?: string;
  message: string;
  is_read: boolean;
  created_at: Date;
}

// =========================
// SCHEMAS
// =========================

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  role: { type: String, required: true, default: 'customer' },
  first_name: String,
  last_name: String,
  phone: String,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const ProductSchema = new Schema<IProduct>({
  slug: { type: String, required: true, index: true },  // Add index for fast lookups
  title: { type: String, required: true },
  description: String,
  status: { type: String, required: true, default: 'draft', index: true },  // Index for filtering
  base_price_cents: { type: Number, required: true, default: 0 },
  is_promotional: { type: Boolean, required: true, default: false, index: true },  // Index for featured queries
  promotion_text: String,
  promotion_discount_percent: Number,
  seo_title: String,
  seo_description: String,
  created_at: { type: Date, default: Date.now, index: -1 },  // Index for sorting by date (descending)
  updated_at: { type: Date, default: Date.now }
});

const ProductImageSchema = new Schema<IProductImage>({
  product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },  // Index for fast product image lookup
  url: { type: String, required: true },
  alt: { type: String, required: true },
  sort: { type: Number, required: true, default: 0 },
  created_at: { type: Date, default: Date.now }
});

const AnnouncementSchema = new Schema<IAnnouncement>({
  slug: { type: String, required: true, index: true },
  title: { type: String, required: true },
  excerpt: String,
  body_richtext: String,
  banner_image: String,
  published_at: Date,
  start_at: Date,
  end_at: Date,
  is_featured: { type: Boolean, required: true, default: false, index: true },
  created_at: { type: Date, default: Date.now, index: -1 }
});

const AddressSchema = new Schema<IAddress>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, required: true },
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address_line_1: { type: String, required: true },
  address_line_2: String,
  city: { type: String, required: true },
  state: String,
  postal_code: { type: String, required: true },
  country: { type: String, required: true, default: 'South Africa' },
  created_at: { type: Date, default: Date.now }
});

const OrderSchema = new Schema<IOrder>({
  order_no: { type: String, required: true, index: true, unique: true },  // Index for order lookups
  user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  email: String,
  status: { type: String, required: true, default: 'pending', index: true },  // Index for filtering by status
  payment_status: { type: String, required: true, default: 'pending', index: true },
  subtotal_cents: { type: Number, required: true, default: 0 },
  shipping_cents: { type: Number, required: true, default: 0 },
  discount_cents: { type: Number, required: true, default: 0 },
  tax_cents: { type: Number, required: true, default: 0 },
  total_cents: { type: Number, required: true, default: 0 },
  shipping_address_id: { type: Schema.Types.ObjectId, ref: 'Address' },
  billing_address_id: { type: Schema.Types.ObjectId, ref: 'Address' },
  gateway: { type: String, required: true, default: 'ozow' },
  gateway_ref: String,
  created_at: { type: Date, default: Date.now, index: -1 }  // Index for sorting orders by date
});

const OrderItemSchema = new Schema<IOrderItem>({
  order_id: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },  // Index for order item lookup
  product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  product_variant_id: { type: Schema.Types.ObjectId },
  quantity: { type: Number, required: true, default: 1 },
  unit_price_cents: { type: Number, required: true },
  total_price_cents: { type: Number, required: true },
  product_title: { type: String, required: true },
  product_slug: { type: String, required: true },
  created_at: { type: Date, default: Date.now }
});

const OrderDeliverySchema = new Schema<IOrderDelivery>({
  order_id: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },  // Index for delivery lookup
  delivery_method: { type: String, required: true },
  pickup_date: Date,
  pickup_time: String,
  shipping_address_id: { type: Schema.Types.ObjectId, ref: 'Address' },
  tracking_number: String,
  delivery_status: { type: String, required: true, default: 'pending' },
  notes: String,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const ContactSchema = new Schema<IContact>({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  message: { type: String, required: true },
  is_read: { type: Boolean, required: true, default: false },
  created_at: { type: Date, default: Date.now }
});

// =========================
// MODELS
// =========================

export const User = mongoose.model<IUser>('User', UserSchema);
export const Product = mongoose.model<IProduct>('Product', ProductSchema);
export const ProductImage = mongoose.model<IProductImage>('ProductImage', ProductImageSchema);
export const Announcement = mongoose.model<IAnnouncement>('Announcement', AnnouncementSchema);
export const Address = mongoose.model<IAddress>('Address', AddressSchema);
export const Order = mongoose.model<IOrder>('Order', OrderSchema);
export const OrderItem = mongoose.model<IOrderItem>('OrderItem', OrderItemSchema);
export const OrderDelivery = mongoose.model<IOrderDelivery>('OrderDelivery', OrderDeliverySchema);
export const Contact = mongoose.model<IContact>('Contact', ContactSchema);
