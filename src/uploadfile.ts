import express, { NextFunction, Request, Response } from "express";
import path from "path";
import fs from 'fs';
import multer from "multer";
import { v2 as cloudinary } from 'cloudinary';
import { CONFIG } from "./config/config";

//TẢI HÌNH ẢNH LÊN LOCAL
const uploadDirectory = path.resolve(__dirname, 'uploads', 'images');
fs.mkdirSync(uploadDirectory, { recursive: true });
const diskStorage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, uploadDirectory);
    },
    filename: (req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        if (!allowed.includes(extension)) return callback(new Error('Unsupported file type'), '');
        const fileName = `${Date.now()}-${require('crypto').randomBytes(16).toString('hex')}${extension}`;
        callback(null, fileName);
    }
});
export let uploadFile = multer({ storage: diskStorage, limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10, parts: 12 } }).single("file");

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
    //đã cấu hình ở server.ts-đóng cmt
    uploadFile(req, res, (error) => {
        if (error) {
            return res.status(400).json({ message: 'Upload không hợp lệ' });
        }
        if (!req.file || !req.file.path.startsWith(uploadDirectory + path.sep)) return res.status(400).json({ message: 'File không hợp lệ' });
        const bytes = fs.readFileSync(req.file.path);
        const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
        const gif = bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
        const webp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
        if (!png && !jpeg && !gif && !webp) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: 'Nội dung ảnh không hợp lệ' });
        }
        return res.sendFile(req.file.path);
    })
}

export const upload = {
    get_Uploadfile,
    post_Uploadfile,
}
