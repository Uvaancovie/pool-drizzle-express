import { Schema, model, Document, Types } from 'mongoose';

export interface IOrderItem {
  product_id: Types.ObjectId;
  product_variant_id?: number;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  product_title: string;
  product_slug: string;
}

export interface IOrderDelivery {
  delivery_method: 'pickup' | 'shipping';
  pickup_date?: Date;
  pickup_time?: string;
  shipping_address_id?: Types.ObjectId;
  tracking_number?: string;
  delivery_status: 'pending' | 'shipped' | 'delivered' | 'picked_up';
  notes?: string;
}

export interface IOrder extends Document {
  order_no: string;
  user_id?: Types.ObjectId;
  email?: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  shipping_address_id?: Types.ObjectId;
  billing_address_id?: Types.ObjectId;
  gateway: string;
  gateway_ref?: string;
  items: IOrderItem[];
  delivery?: IOrderDelivery;
  createdAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>({
  product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  product_variant_id: Number,
  quantity: { type: Number, required: true, default: 1 },
  unit_price_cents: { type: Number, required: true },
  total_price_cents: { type: Number, required: true },
  product_title: { type: String, required: true },
  product_slug: { type: String, required: true }
}, { _id: false });

const OrderDeliverySchema = new Schema<IOrderDelivery>({
  delivery_method: { type: String, enum: ['pickup', 'shipping'], required: true },
  pickup_date: Date,
  pickup_time: String,
  shipping_address_id: { type: Schema.Types.ObjectId, ref: 'Address' },
  tracking_number: String,
  delivery_status: { type: String, enum: ['pending', 'shipped', 'delivered', 'picked_up'], default: 'pending' },
  notes: String
}, { _id: false });

const OrderSchema = new Schema<IOrder>({
  order_no: { type: String, required: true, unique: true, index: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  email: String,
  status: { type: String, enum: ['pending', 'processing', 'completed', 'cancelled'], default: 'pending', index: true },
  payment_status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  subtotal_cents: { type: Number, default: 0 },
  shipping_cents: { type: Number, default: 0 },
  discount_cents: { type: Number, default: 0 },
  tax_cents: { type: Number, default: 0 },
  total_cents: { type: Number, default: 0 },
  shipping_address_id: { type: Schema.Types.ObjectId, ref: 'Address' },
  billing_address_id: { type: Schema.Types.ObjectId, ref: 'Address' },
  gateway: { type: String, default: 'ozow' },
  gateway_ref: String,
  items: [OrderItemSchema],
  delivery: OrderDeliverySchema
}, { timestamps: true });

export default model<IOrder>('Order', OrderSchema);
