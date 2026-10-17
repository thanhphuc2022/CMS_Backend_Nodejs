import multer from "multer";
import { Request, Response, NextFunction } from 'express';

//// Cấu hình Multer để xử lý tải lên hình ảnh dành cho lấy dữ liệu từ bộ nhớ đệm
const diskStorage = multer.memoryStorage();

//midlleware xử lý lấy dữ liệu từ form 
const parseMultipartFile = multer({
    storage: diskStorage,
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20, fieldSize: 100 * 1024, parts: 21 }
}).single("file");

export function midlleware_file(req: Request, res: Response, next: NextFunction) {
    parseMultipartFile(req, res, (error) => {
        if (!error) return next();
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ message: 'File vượt quá giới hạn cho phép' });
        }
        return res.status(400).json({ message: 'Multipart không hợp lệ' });
    });
}

export function validateImageContent(req: Request, res: Response, next: NextFunction) {
    const file = req.file;
    if (!file) return next();
    const b = file.buffer;
    const isPng = b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const isGif = b.length >= 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('ascii'));
    const isWebp = b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
    if (!isPng && !isJpeg && !isGif && !isWebp) return res.status(400).json({ message: 'Nội dung ảnh không hợp lệ' });
    return next();
}
