import { Schema, model, Document } from 'mongoose';

export interface IProductImage {
  url: string;
  publicId?: string;
  alt: string;
  sort: number;
}

export interface IProduct extends Document {
  slug: string;
  title: string;
  description?: string;
  status: 'draft' | 'published' | 'archived';
  base_price_cents: number;
  is_promotional: boolean;
  promotion_text?: string;
  promotion_discount_percent?: number;
  seo_title?: string;
  seo_description?: string;
  images: IProductImage[];
  createdAt: Date;
  updatedAt: Date;
}

const ProductImageSchema = new Schema<IProductImage>({
  url: { type: String, required: true },
  publicId: String,
  alt: { type: String, required: true },
  sort: { type: Number, default: 0 }
}, { _id: false });

const ProductSchema = new Schema<IProduct>({
  slug: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, index: 'text' },
  description: String,
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  base_price_cents: { type: Number, required: true, default: 0 },
  is_promotional: { type: Boolean, default: false },
  promotion_text: String,
  promotion_discount_percent: Number,
  seo_title: String,
  seo_description: String,
  images: [ProductImageSchema]
}, { timestamps: true });

export default model<IProduct>('Product', ProductSchema);
