import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { uploadImageToCloudinary } from './sp';

// Only images uploaded privately by this request may be rolled back. Existing
// URLs can be shared (including in HTML), so keep them without an atomic claim
// over all references. A read-before-destroy check alone would race with writers.
export async function replaceDisplayImage(
    model: Model<any>, id: string, fields: Record<string, string>, file: Express.Multer.File
): Promise<'updated' | 'missing' | 'conflict'> {
    const previous = await model.findOne({ id });
    if (!previous) return 'missing';
    if (!previous._id || typeof previous.images !== 'string') throw new Error('Invalid display image record');

    const privateId = `display-${randomUUID()}`;
    const images = await uploadImageToCloudinary(file, undefined, privateId);
    let updated;
    try {
        updated = await model.findOneAndUpdate(
            { _id: previous._id, images: previous.images },
            { ...fields, images },
            { new: true }
        );
    } catch {
        // A rejected write may have committed before a network/acknowledgement
        // failure. Do not destroy an image that might now be referenced.
        console.warn('Display image retained: database write outcome unknown');
        throw new Error('Display image update failed');
    }
    if (!updated) {
        // A successful conditional command with no match never published this
        // request's unique URL. It is safe to remove only that private upload.
        try {
            const result = await cloudinary.uploader.destroy(`Tinhocnhuy/${privateId}`, { resource_type: 'image' });
            if (!['ok', 'not found'].includes(result?.result)) {
                console.warn('Display image rollback cleanup incomplete');
            }
        } catch {
            console.warn('Display image rollback cleanup failed');
        }
        return 'conflict';
    }
    if (updated.images !== images) {
        console.warn('Display image retained: database result could not be confirmed');
        throw new Error('Display image update failed');
    }
    console.warn('Previous display image retained: shared references cannot be excluded atomically');
    return 'updated';
}
