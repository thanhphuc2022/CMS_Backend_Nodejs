import { Request, Response } from "express";
import { Content_Banner_Model } from "../Display_Model/Content_Banner_Model";
import { convertToSlug, deleteImageFromCloudinary, randomStringPost, uploadImageToCloudinary } from "../../Services/sp";
import { sanitizeRichHtml } from '../../Security/html';

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
    let images: string | null = null;
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
            const old_content_banner = await Content_Banner_Model.findOne({ id: id })
            const old_image = old_content_banner?.images
            if (old_image) {
                const urlObject = new URL(old_image);
                const path = urlObject.pathname;
                const idImage = path.substring(path.indexOf('Tinhocnhuy/'), path.lastIndexOf('.'));
                await deleteImageFromCloudinary(idImage)
            }
            images = await uploadImageToCloudinary(linkimages);
            await Content_Banner_Model.findOneAndUpdate({ id: id }, {
                title: title,
                content: safeContent,
                linkservices: linkservices,
                images: images
            })
            return res.json({ message: "Cập nhật thành công" })
        }
    } catch (error) {
        return res.status(500).json(error)
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
