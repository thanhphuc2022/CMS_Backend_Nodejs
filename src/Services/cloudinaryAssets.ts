import { v2 as cloudinary } from 'cloudinary';
import { CONFIG } from '../config/config';
import { CloudinaryAssetModel, CloudinaryResourceKind } from '../Model/CloudinaryAsset_Model';
import { PostModel } from '../Model/Post_Model';
import { NewsModel } from '../Model/News_Models';

const CONTENT_FOLDER = 'Tinhocnhuy';

export async function uploadImageBuffer(buffer: Buffer, ownerId: string): Promise<string> {
    cloudinary.config({ cloud_name: CONFIG.cloudinary.cloud_name, api_key: CONFIG.cloudinary.api_key, api_secret: CONFIG.cloudinary.api_secret });
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ resource_type: 'image', folder: CONTENT_FOLDER }, (error, result) => {
            if (error || !result) return reject(new Error('Cloudinary upload failed'));
            void recordUploadedImage({ publicId: result.public_id, secureUrl: result.secure_url, ownerId })
                .then(() => resolve(result.secure_url))
                .catch(async () => {
                    await cloudinary.uploader.destroy(result.public_id, { resource_type: 'image' }).catch(() => undefined);
                    reject(new Error('Cloudinary asset registration failed'));
                });
        }).end(buffer);
    });
}

function isManagedImage(asset: { publicId: string; cloudName: string; folder: string; resourceType: string }) {
    return Boolean(CONFIG.cloudinary.cloud_name) &&
        asset.cloudName === CONFIG.cloudinary.cloud_name &&
        asset.folder === CONTENT_FOLDER &&
        asset.resourceType === 'image' &&
        asset.publicId.startsWith(`${CONTENT_FOLDER}/`);
}

export async function recordUploadedImage(input: {
    publicId: string;
    secureUrl: string;
    ownerId: string;
}) {
    if (!input.ownerId || !CONFIG.cloudinary.cloud_name || !input.publicId.startsWith(`${CONTENT_FOLDER}/`) || !input.secureUrl.startsWith('https://')) return;
    await CloudinaryAssetModel.create({
        ...input,
        cloudName: CONFIG.cloudinary.cloud_name,
        folder: CONTENT_FOLDER,
        resourceType: 'image'
    });
}

export function extractCloudinaryImageUrls(html: string): string[] {
    const urls = new Set<string>();
    const pattern = /\bsrc\s*=\s*(["'])(.*?)\1/gi;
    for (const match of html.matchAll(pattern)) {
        try {
            const url = new URL(match[2]);
            if (url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' &&
                CONFIG.cloudinary.cloud_name && url.pathname.includes(`/${CONFIG.cloudinary.cloud_name}/image/upload/`) &&
                url.pathname.includes(`/${CONTENT_FOLDER}/`)) urls.add(url.toString());
        } catch { /* ignore non-URL src values */ }
    }
    return [...urls].slice(0, 200);
}

export async function attachUploadedImages(ownerId: string, kind: CloudinaryResourceKind, resourceId: string, html: string, thumbnailUrl?: string, requireThumbnail = false) {
    const urls = new Set(extractCloudinaryImageUrls(html));
    if (thumbnailUrl) urls.add(thumbnailUrl);
    if (!urls.size) return;
    const assets = await CloudinaryAssetModel.find({
        ownerId,
        secureUrl: { $in: [...urls] }
    }).select(requireThumbnail ? '_id secureUrl' : '_id');
    if (requireThumbnail && !assets.some((asset) => asset.secureUrl === thumbnailUrl)) {
        throw new Error('Thumbnail registry entry not found');
    }
    if (!assets.length) return;
    const result = await CloudinaryAssetModel.updateMany(
        { _id: { $in: assets.map((asset) => asset._id) }, ownerId },
        { $addToSet: { resources: { kind, resourceId } } }
    );
    if (requireThumbnail && (!result.acknowledged || result.matchedCount !== assets.length)) {
        throw new Error('Image registry attachment not confirmed');
    }
}

function regexEscape(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Update-only preparation. Keep all old references: detaching/deleting requires
// the deferred create/cleanup race to be resolved first. This does not call cleanup.
export async function prepareUpdatedImageReferences(ownerId: string, kind: CloudinaryResourceKind, resourceId: string, html: string, thumbnailUrl?: string, newThumbnail = false) {
    const urls = new Set(extractCloudinaryImageUrls(html));
    if (thumbnailUrl) urls.add(thumbnailUrl);
    if (!urls.size) return;
    const assets = await CloudinaryAssetModel.find({ ownerId, secureUrl: { $in: [...urls] } }).select('_id secureUrl');
    if (newThumbnail && !assets.some((asset) => asset.secureUrl === thumbnailUrl)) {
        throw new Error('New thumbnail registry entry not found');
    }
    if (!assets.length) return; // Legacy or externally owned images remain untouched.
    const result = await CloudinaryAssetModel.updateMany(
        { _id: { $in: assets.map((asset) => asset._id) }, ownerId },
        { $addToSet: { resources: { kind, resourceId } } }
    );
    if (!result.acknowledged || result.matchedCount !== assets.length) {
        throw new Error('Updated image references not confirmed');
    }
}

async function recordOtherReferences(asset: { _id: unknown; secureUrl: string }, kind: CloudinaryResourceKind, resourceId: string) {
    const regex = new RegExp(regexEscape(asset.secureUrl));
    const [posts, news] = await Promise.all([
        kind === 'post' ? PostModel.find({ id: { $ne: resourceId }, $or: [{ avatar: asset.secureUrl }, { content: regex }] }).select('id').lean() :
            PostModel.find({ $or: [{ avatar: asset.secureUrl }, { content: regex }] }).select('id').lean(),
        kind === 'news' ? NewsModel.find({ id: { $ne: resourceId }, $or: [{ avatar: asset.secureUrl }, { content: regex }] }).select('id').lean() :
            NewsModel.find({ $or: [{ avatar: asset.secureUrl }, { content: regex }] }).select('id').lean()
    ]);
    const refs = [...posts.map((row) => ({ kind: 'post' as const, resourceId: row.id })), ...news.map((row) => ({ kind: 'news' as const, resourceId: row.id }))];
    if (refs.length) await CloudinaryAssetModel.updateOne({ _id: asset._id }, { $addToSet: { resources: { $each: refs } } });
    return refs.length > 0;
}

export async function cleanupResourceImages(kind: CloudinaryResourceKind, resourceId: string, keepUrls: string[] = []) {
    const keep = new Set(keepUrls);
    const assets = await CloudinaryAssetModel.find({ resources: { $elemMatch: { kind, resourceId } } }).exec();
    for (const asset of assets) {
        if (keep.has(asset.secureUrl)) continue;
        if (!isManagedImage(asset)) continue;
        try {
            const stillReferenced = await recordOtherReferences(asset, kind, resourceId);
            if (stillReferenced) {
                await CloudinaryAssetModel.updateOne({ _id: asset._id }, { $pull: { resources: { kind, resourceId } } });
                continue;
            }
            await cloudinary.uploader.destroy(asset.publicId, { resource_type: 'image' });
            await CloudinaryAssetModel.deleteOne({ _id: asset._id });
        } catch { /* keep registry row so a later cleanup can retry */ }
    }
}
