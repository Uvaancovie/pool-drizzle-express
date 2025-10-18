import { Schema, model, Document, Types } from 'mongoose';

export interface IAddress extends Document {
  user_id?: Types.ObjectId;
  type: 'shipping' | 'billing';
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
  createdAt: Date;
}

const AddressSchema = new Schema<IAddress>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['shipping', 'billing'], required: true },
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address_line_1: { type: String, required: true },
  address_line_2: String,
  city: { type: String, required: true },
  state: String,
  postal_code: { type: String, required: true },
  country: { type: String, default: 'South Africa' }
}, { timestamps: true });

export default model<IAddress>('Address', AddressSchema);
