import { randomUUID } from 'crypto';
import { Model, Types, mongo } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { CONFIG } from '../config/config';
import { CloudinaryAssetModel, CloudinaryResourceKind } from '../Model/CloudinaryAsset_Model';
import { uploadImageToCloudinary } from './sp';
import { attachUploadedImages, recordUploadedImage } from './cloudinaryAssets';

export class ContentCreationUncertain extends Error {
    constructor(public readonly resourceId: string) {
        super('Content creation outcome unknown');
    }
}

// Registry references are prepared before publishing the article. No transaction
// or Cloudinary call is made inside a database transaction.
export async function createContentWithImages(
    model: Model<any>, kind: CloudinaryResourceKind, ownerId: string,
    fields: Record<string, any>, file: Express.Multer.File
) {
    if (!ownerId || !CONFIG.cloudinary.cloud_name) throw new Error('Image registry configuration missing');
    const requestId = new Types.ObjectId();
    const privateId = `content-${randomUUID()}`;
    const publicId = `Tinhocnhuy/${privateId}`;
    const avatar = await uploadImageToCloudinary(file, undefined, privateId);
    const data = { ...fields, _id: requestId, avatar };
    async function cleanupPrivateThumbnail() {
        // This private URL has never been published by an article write. Cleanup
        // only this upload; never undo shared TinyMCE references with $pull.
        try {
            const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
            if (['ok', 'not found'].includes(result?.result)) {
                await CloudinaryAssetModel.deleteOne({ publicId, secureUrl: avatar, ownerId });
            } else {
                console.warn('Content thumbnail retained: cleanup not confirmed');
            }
        } catch {
            console.warn('Content thumbnail cleanup incomplete; registry retained');
        }
    }
    try {
        // Validation can fail without ever sending an article write to MongoDB.
        await new model(data).validate();
        await recordUploadedImage({ publicId, secureUrl: avatar, ownerId });
        await attachUploadedImages(ownerId, kind, fields.id, fields.content, avatar, true);
    } catch {
        await cleanupPrivateThumbnail();
        throw new Error('Content preparation failed');
    }
    try {
        await model.create(data);
    } catch (error) {
        // An insert may commit before its acknowledgement is lost. Confirm only
        // this request's document, not another article with the same slug/id.
        let confirmedAbsent = false;
        try {
            const saved = await model.findOne({ _id: requestId, id: fields.id, avatar }).read('primary');
            if (saved) return;
            confirmedAbsent = true;
        } catch { /* Outcome remains unknown; keep the image and registry. */ }
        if (confirmedAbsent && error instanceof mongo.MongoServerError && error.code === 11000) {
            // A server duplicate-key rejection and a confirmed absent own
            // document establish that this insert did not publish the URL.
            await cleanupPrivateThumbnail();
            throw new Error('Content insert rejected');
        }
        console.warn('Content creation outcome unknown; thumbnail and registry retained');
        throw new ContentCreationUncertain(fields.id);
    }
}
