import { Schema, model, Document } from 'mongoose';

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
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>({
  slug: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  excerpt: String,
  body_richtext: String,
  banner_image: String,
  published_at: Date,
  start_at: Date,
  end_at: Date,
  is_featured: { type: Boolean, default: false }
}, { timestamps: true });

export default model<IAnnouncement>('Announcement', AnnouncementSchema);
