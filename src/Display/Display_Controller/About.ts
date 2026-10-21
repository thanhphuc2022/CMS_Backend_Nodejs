import { Request, Response } from "express";
// import { About_Model } from "../../Model/Display_Model/About_Model";
import { About_Model } from "../Display_Model/About_Model";
import { convertToSlug, deleteImageFromCloudinary, randomStringPost, uploadImageToCloudinary } from "../../Services/sp";
import { sanitizeRichHtml } from '../../Security/html';
import { replaceDisplayImage } from '../../Services/replaceDisplayImage';

interface TempMulterFile extends Express.Multer.File {
    buffer: Buffer;
}

async function createAbout(req: Request, res: Response) {
    let images: string | null = null;

    try {
        const title = req.body.title;
        const content = req.body.content;
        const linkimages = req.file as TempMulterFile;

        if (!linkimages) {
            return res.status(400).json({ error: 'No image provided.' });
        }
        if (typeof title !== 'string' || typeof content !== 'string' || title.length > 200 || content.length > 500_000 || title === '' || content === '') {
            return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" })
        } else {
            const safeContent = sanitizeRichHtml(content);
            const id_slug = convertToSlug(title)
            const id = await About_Model.findOne({ id: id_slug })
            var idAbout
            if (!id) {
                idAbout = id_slug
            } else {
                idAbout = id_slug + '-' + randomStringPost
            }

            images = await uploadImageToCloudinary(linkimages)
            await About_Model.create({
                id: idAbout,
                title: title,
                content: safeContent,
                images: images
            })
            return res.json({ message: "Thêm thành công" })
        }
    } catch {
        return res.status(500).json({ message: 'Internal server error' });
    }
}

async function updateAbout(req: Request, res: Response) {
    try {
        const id = req.params.id;
        const title = req.body.title;
        const content = req.body.content;
        if (typeof title !== 'string' || typeof content !== 'string' || title.length > 200 || content.length > 500_000) {
            return res.status(400).json({ message: 'Invalid about data' });
        }
        const safeContent = sanitizeRichHtml(content);
        const linkimages = req.file as TempMulterFile;
        if (!linkimages) {
            await About_Model.findOneAndUpdate({ id: id }, {
                title: title,
                content: safeContent,
            })
            return res.json({ message: "Cập nhật thành công" })
        } else {
            const result = await replaceDisplayImage(About_Model, id, {
                title: title,
                content: safeContent,
            }, linkimages);
            if (result === 'missing') return res.status(404).json({ message: 'Resource not found' });
            if (result === 'conflict') return res.status(409).json({ message: 'Resource changed; reload before updating' });
            return res.json({ message: "Cập nhật thành công" })
        }
    } catch {
        return res.status(500).json({ message: 'Internal server error' });
    }
}

async function deleteAbout(req: Request, res: Response) {
    const id = req.params.id;
    try {
        const about = await About_Model.findOne({ id: id });
        const idimages = about?.images
        if (idimages) {
            const urlObject = new URL(idimages);
            const path = urlObject.pathname;
            const idImage = path.substring(path.indexOf('Tinhocnhuy/'), path.lastIndexOf('.'));
            await deleteImageFromCloudinary(idImage)
        }
        await About_Model.deleteOne({ id: id });
        return res.json({ message: "Đã xoá bài viết" });
    } catch (error) {
        res.status(500).json(error);
    }
}

async function allAbout(req: Request, res: Response) {
    const about = await About_Model.find({})
    return res.json(about.map((item) => ({ ...item.toObject(), content: sanitizeRichHtml(item.content) })))
}

export const About = {
    createAbout,
    updateAbout,
    deleteAbout,
    allAbout
}
