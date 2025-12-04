import mongoose, { Schema, Document, Types } from "mongoose";

const ItemSchema = new Schema({
  productId: String,
  title: String,
  slug: String,
  price: Number,      // cents
  quantity: Number,
  image: String,
  fabric: String
}, { _id: false });

const AddressSchema = new Schema({
  type: { type: String, enum: ["delivery", "pickup"], required: true },
  phone: { type: String, default: "" },
  address1: { type: String, default: "" },
  city: { type: String, default: "" },
  province: { type: String, default: "" },
  postalCode: { type: String, default: "" }
}, { _id: false });

const CustomerSchema = new Schema({
  first_name: String,
  last_name: String,
  email_address: String
}, { _id: false });

export interface IPayfastOrder extends Document {
  _id: Types.ObjectId;
  m_payment_id: string;
  provider: string;
  status: "pending" | "paid" | "cancelled" | "error";
  items: any[];
  subtotal_cents: number;
  shipping_cents: number;
  discount_cents?: number;
  total_cents: number;
  shipping: any;
  customer: any;
  gateway_txn_id?: string;
  gateway_status?: string;
  payment_status?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PayfastOrderSchema = new Schema({
  m_payment_id: { type: String, index: true, unique: true, required: true },
  provider: { type: String, default: "payfast" },
  status: { 
    type: String, 
    enum: ["pending","paid","cancelled","error"], 
    default: "pending"
  },
  items: [ItemSchema],
  subtotal_cents: Number,
  shipping_cents: Number,
  discount_cents: Number,
  total_cents: Number,
  shipping: AddressSchema,
  customer: CustomerSchema,
  gateway_txn_id: String,
  gateway_status: String,
  payment_status: String,
}, { timestamps: true });

export const PayfastOrder = mongoose.model<IPayfastOrder>("PayfastOrder", PayfastOrderSchema);
