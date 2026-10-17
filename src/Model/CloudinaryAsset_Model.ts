import mongoose, { Document, Schema } from 'mongoose';

export type CloudinaryResourceKind = 'post' | 'news';

interface ResourceReference {
    kind: CloudinaryResourceKind;
    resourceId: string;
}

export interface CloudinaryAsset extends Document {
    publicId: string;
    secureUrl: string;
    ownerId: string;
    cloudName: string;
    folder: string;
    resourceType: string;
    resources: ResourceReference[];
}

const schema = new Schema<CloudinaryAsset>({
    publicId: { type: String, required: true, unique: true },
    secureUrl: { type: String, required: true },
    ownerId: { type: String, required: true },
    cloudName: { type: String, required: true },
    folder: { type: String, required: true },
    resourceType: { type: String, required: true, enum: ['image'] },
    resources: [{ kind: { type: String, enum: ['post', 'news'], required: true }, resourceId: { type: String, required: true } }]
}, { collection: 'CloudinaryAssets', timestamps: true });

schema.index({ 'resources.kind': 1, 'resources.resourceId': 1 });
schema.index({ ownerId: 1, secureUrl: 1 });

export const CloudinaryAssetModel = mongoose.model<CloudinaryAsset>('CloudinaryAsset', schema);
