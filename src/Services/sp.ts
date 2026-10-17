import { v2 as cloudinary } from 'cloudinary';
import slugify from 'slugify';
import { CONFIG } from '../config/config';
import { recordUploadedImage } from './cloudinaryAssets';

//hàm tạo chuỗi ngẫu nhiên tù 1->10 kí tự
function generateRandomStringPost() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    const length = Math.floor(Math.random() * 10) + 1; // Độ dài chuỗi từ 1 đến 10

    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charactersLength);
        result += characters.charAt(randomIndex);
    }
    return result;
}
export const randomStringPost = generateRandomStringPost();

export async function uploadImageToCloudinary(image: Express.Multer.File, ownerId?: string) {
    try {
        if (!image) {
            throw new Error('No image provided.');
        }
        cloudinary.config({ cloud_name: CONFIG.cloudinary.cloud_name, api_key: CONFIG.cloudinary.api_key, api_secret: CONFIG.cloudinary.api_secret });
        const base64Image = image.buffer.toString('base64');
        const format = image.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
            : image.buffer[0] === 0xff && image.buffer[1] === 0xd8 ? 'jpeg'
            : ['GIF87a', 'GIF89a'].includes(image.buffer.subarray(0, 6).toString('ascii')) ? 'gif'
            : image.buffer.toString('ascii', 0, 4) === 'RIFF' && image.buffer.toString('ascii', 8, 12) === 'WEBP' ? 'webp'
            : null;
        if (!format) throw new Error('Unsupported image data');
        const result = await cloudinary.uploader.upload(`data:image/${format};base64,${base64Image}`, {
            folder: 'Tinhocnhuy', // Tên thư mục chứa các thumbnail trên Cloudinary
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        });
        if (ownerId) await recordUploadedImage({ publicId: result.public_id, secureUrl: result.secure_url, ownerId });
        return result.secure_url;
    } catch (error) {
        throw new Error('Failed to upload image to Cloudinary.');
    }
}

//HÀM LẤY PUBLIC_ID TỪ LINK HÌNH ẢNH CLOUDINARY
export function getPublicIdFromUrl(url: string) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return '';
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts[0] !== CONFIG.cloudinary.cloud_name) return '';
        const uploadIndex = parts.indexOf('upload');
        if (uploadIndex < 0) return '';
        const folderIndex = parts.indexOf('Tinhocnhuy', uploadIndex + 1);
        if (folderIndex < 0 || folderIndex !== parts.length - 2) return '';
        return `Tinhocnhuy/${parts[folderIndex + 1].replace(/\.[^.]+$/, '')}`;
    } catch {
        return '';
    }
}

//HÀM XÓA HÌNH ẢNH ĐÃ UPLOAD LÊN COUDINARY
export async function deleteImageFromCloudinary(publicId: string) {
    if (!/^Tinhocnhuy\/[A-Za-z0-9_-]+$/.test(publicId) || !CONFIG.cloudinary.cloud_name || !CONFIG.cloudinary.api_secret) return;
    try {
        cloudinary.config({ cloud_name: CONFIG.cloudinary.cloud_name, api_key: CONFIG.cloudinary.api_key, api_secret: CONFIG.cloudinary.api_secret });
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch {
        // Keep cleanup errors out of client responses and logs.
    }
}


//HÀM CHUYỂN CHUỔI TITLE CHO BÀI VIẾT
export function convertToSlug(title: string): string {
    // Thay thế các ký tự đặc biệt không mong muốn trước khi slugify
    const sanitizedTitle = title.replace(/\//g, '-');  // Thay thế bằng dấu gạch ngang

    const slug = slugify(sanitizedTitle, {
        locale: 'vi', 
        lower: true,   // Chuyển thành chữ thường
        remove: /[*+~.,()'"!:@]/g,  // Loại bỏ các ký tự đặc biệt không mong muốn
    });
    return slug;
}
