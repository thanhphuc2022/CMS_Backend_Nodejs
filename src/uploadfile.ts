import { Request, Response } from "express";
import path from "path";
import multer from "multer";
import { v2 as cloudinary } from 'cloudinary';
import { CONFIG } from "./config/config";

// This endpoint returns the validated image; persistent content uploads use Cloudinary.
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
export let uploadFile = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10, parts: 12 },
    fileFilter: (_req, file, callback) => {
        if (!allowedExtensions.has(path.extname(file.originalname).toLowerCase())) {
            return callback(new Error('Unsupported file type'));
        }
        return callback(null, true);
    }
}).single("file");

cloudinary.config({
    cloud_name: CONFIG.cloudinary.cloud_name,
    api_key: CONFIG.cloudinary.api_key,
    api_secret: CONFIG.cloudinary.api_secret
})

async function get_Uploadfile(req: Request, res: Response) {
    res.render('demo.ejs')
    // res.render('createpost')
}
async function post_Uploadfile(req: Request, res: Response) {
    uploadFile(req, res, (error) => {
        if (error) {
            return res.status(400).json({ message: 'Upload không hợp lệ' });
        }
        if (!req.file?.buffer) return res.status(400).json({ message: 'File không hợp lệ' });
        const bytes = req.file.buffer;
        const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const gif = bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
        const webp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
        if (!png && !jpeg && !gif && !webp) return res.status(400).json({ message: 'Nội dung ảnh không hợp lệ' });
        const contentType = png ? 'image/png' : jpeg ? 'image/jpeg' : gif ? 'image/gif' : 'image/webp';
        return res.type(contentType).send(bytes);
    })
}

export const upload = {
    get_Uploadfile,
    post_Uploadfile,
}
