import mongoose, { Schema, Document } from "mongoose";

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

export interface IOzowOrder extends Document {
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
  createdAt: Date;
  updatedAt: Date;
}

const OzowOrderSchema = new Schema({
  m_payment_id: { type: String, index: true, unique: true, required: true },
  provider: { type: String, default: "ozow" },
  status: { 
    type: String, 
    enum: ["pending","paid","cancelled","error"], 
    default: "pending",
    index: true
  },
  items: [ItemSchema],
  subtotal_cents: { type: Number, required: true },
  shipping_cents: { type: Number, required: true },
  total_cents: { type: Number, required: true },
  shipping: AddressSchema,
  customer: CustomerSchema,
  gateway_txn_id: String,
  gateway_status: String
}, { timestamps: true });

export default mongoose.models.OzowOrder || mongoose.model<IOzowOrder>("OzowOrder", OzowOrderSchema);
