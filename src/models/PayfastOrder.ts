import { Schema, model, Document, Types } from 'mongoose';

export interface IOrderItem {
  productId: Types.ObjectId;
  variant?: any;
  qty: number;
  priceAtPurchase: number;
}

export interface IOrderTotals {
  subtotal: number;
  shipping: number;
  discount: number;
  vat: number;
  grandTotal: number;
}

export interface IOrderPayment {
  provider: string;
  pfData?: any;
  result?: string;
}

export interface IOrderShipping {
  name: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  postalCode: string;
}

export interface IPayfastOrder extends Document {
  number: string;
  items: IOrderItem[];
  totals: IOrderTotals;
  status: 'pending' | 'processing' | 'paid' | 'shipped' | 'cancelled' | 'refunded';
  payment?: IOrderPayment;
  shipping: IOrderShipping;
  customerEmail?: string;
  customerName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  variant: Schema.Types.Mixed,
  qty: { type: Number, required: true, min: 1 },
  priceAtPurchase: { type: Number, required: true }
});

const OrderTotalsSchema = new Schema({
  subtotal: { type: Number, required: true },
  shipping: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  vat: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true }
});

const OrderPaymentSchema = new Schema({
  provider: String,
  pfData: Schema.Types.Mixed,
  result: String
});

const OrderShippingSchema = new Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  address1: { type: String, required: true },
  address2: String,
  city: { type: String, required: true },
  province: { type: String, required: true },
  postalCode: { type: String, required: true }
});

const PayfastOrderSchema = new Schema<IPayfastOrder>({
  number: { type: String, required: true, unique: true, index: true },
  items: { type: [OrderItemSchema], required: true },
  totals: { type: OrderTotalsSchema, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'shipped', 'cancelled', 'refunded'],
    default: 'pending'
  },
  payment: OrderPaymentSchema,
  shipping: { type: OrderShippingSchema, required: true },
  customerEmail: String,
  customerName: String
}, { timestamps: true });

export default model<IPayfastOrder>('PayfastOrder', PayfastOrderSchema);
