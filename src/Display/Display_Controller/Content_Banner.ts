import { Request, Response } from "express";
import { Content_Banner_Model } from "../Display_Model/Content_Banner_Model";
import { convertToSlug, deleteImageFromCloudinary, randomStringPost, uploadImageToCloudinary } from "../../Services/sp";
import { sanitizeRichHtml } from '../../Security/html';
import { replaceDisplayImage } from '../../Services/replaceDisplayImage';

interface TempMulterFile extends Express.Multer.File {
    buffer: Buffer;
}

async function createContentBanner(req: Request, res: Response) {
    let images: string | null = null;
    try {
        const title = req.body.title;
        const content = req.body.content;
        const linkservices=req.body.linkservices;
        const linkimages = req.file as TempMulterFile;
        if (!linkimages) {
            return res.status(400).json({ error: 'No image provided.' })
        }
        if (typeof title !== 'string' || typeof content !== 'string' || typeof linkservices !== 'string' || title.length > 200 || content.length > 500_000 || linkservices.length > 2000 || title === '') {
            return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" });
        } else {
            const safeContent = sanitizeRichHtml(content);
            const id_slug = convertToSlug(title)
            const id = await Content_Banner_Model.findOne({ id: id_slug })
            var id_titleBanner
            if (!id) {
                id_titleBanner = id_slug
            } else {
                id_titleBanner = id_slug + '-' + randomStringPost
            }
            images = await uploadImageToCloudinary(linkimages)
            await Content_Banner_Model.create({
                id: id_titleBanner,
                title: title,
                content: safeContent,
                linkservices: linkservices,
                images: images
            })
            return res.json({ message: "Thêm thành công" })
        }
    } catch {
        return res.status(500).json({ message: 'Internal server error' });
    }
}

async function updateContentBanner(req: Request, res: Response) {
    try {
        const id = req.params.id;
        const title = req.body.title;
        const content = req.body.content;
        const linkservices=req.body.linkservices;
        const linkimages = req.file as TempMulterFile;
        if (typeof title !== 'string' || typeof content !== 'string' || typeof linkservices !== 'string' || title.length > 200 || content.length > 500_000 || linkservices.length > 2000) {
            return res.status(400).json({ message: 'Invalid banner data' });
        }
        const safeContent = sanitizeRichHtml(content);
        if (!linkimages) {
            await Content_Banner_Model.findOneAndUpdate({ id: id }, {
                title: title,
                content: safeContent,
                linkservices: linkservices
            })
            return res.json({ message: "Cập nhật thành công" })
        } else {
            const result = await replaceDisplayImage(Content_Banner_Model, id, {
                title: title,
                content: safeContent,
                linkservices: linkservices,
            }, linkimages);
            if (result === 'missing') return res.status(404).json({ message: 'Resource not found' });
            if (result === 'conflict') return res.status(409).json({ message: 'Resource changed; reload before updating' });
            return res.json({ message: "Cập nhật thành công" })
        }
    } catch {
        return res.status(500).json({ message: 'Internal server error' });
    }
}

async function deleteContent_Banner(req: Request, res: Response) {
    const id = req.params.id;
    try {
        const content_banner = await Content_Banner_Model.findOne({ id: id });
        const idimages = content_banner?.images
        if (idimages) {
            const urlObject = new URL(idimages);
            const path = urlObject.pathname;
            const idImage = path.substring(path.indexOf('Tinhocnhuy/'), path.lastIndexOf('.'));
            await deleteImageFromCloudinary(idImage)
        }
        await Content_Banner_Model.deleteOne({ id: id });
        return res.json({ message: "Đã xoá" });
    } catch (error) {
        res.status(500).json(error);
    }
}

async function allContent_Banner(req: Request, res: Response) {
    const content_banner = await Content_Banner_Model.find({})
    return res.json({ content_banner: content_banner.map((item) => ({ ...item.toObject(), content: sanitizeRichHtml(item.content) })) })
}

export const Content_Banner = {
    createContentBanner,
    updateContentBanner,
    deleteContent_Banner,
    allContent_Banner
}
