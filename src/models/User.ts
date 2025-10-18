import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password_hash: string;
  role: 'admin' | 'customer';
  first_name?: string;
  last_name?: string;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, unique: true, required: true, index: true },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'customer'], default: 'customer' },
  first_name: String,
  last_name: String,
  phone: String
}, { timestamps: true });

export default model<IUser>('User', UserSchema);
