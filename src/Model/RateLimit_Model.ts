import mongoose, { Document, Schema } from 'mongoose';

interface RateLimitBucket extends Document {
    _id: string;
    count: number;
    expiresAt: Date;
}

const schema = new Schema<RateLimitBucket>({
    _id: { type: String },
    count: { type: Number, required: true },
    expiresAt: { type: Date, required: true }
}, { collection: 'SecurityRateLimits', versionKey: false });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitModel = mongoose.model<RateLimitBucket>('SecurityRateLimit', schema);
