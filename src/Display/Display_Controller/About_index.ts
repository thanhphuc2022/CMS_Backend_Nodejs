import { Request, Response } from "express";
import { About_Index_Model } from "../Display_Model/About_index_Model";
import { sanitizeRichHtml } from '../../Security/html';

async function createAbout_Index(req: Request, res: Response) {
    const content_about_index = req.body.content_about_index;
    if (typeof content_about_index !== 'string' || content_about_index.length > 500_000 || content_about_index === '') {
        return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" })
    } else {
        await About_Index_Model.create({
            content: sanitizeRichHtml(content_about_index)
        })
        return res.json({ message: "Thêm thành công" })
    }
}

async function updateAbout_Index(req: Request, res: Response) {
    try {
        const content = req.body.content_about_index;
        if (typeof content !== 'string' || content.length > 500_000 || content === '') {
            return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" })
        } else {
            await About_Index_Model.updateOne({
                content: sanitizeRichHtml(content)
            })
            return res.json({ message: "Cập nhật thành công" })
        }
    } catch {
        return res.status(500).json({ message: 'Internal server error' });
    }
}

async function deleteAbout_Index(req: Request, res: Response) {
    try {
        await About_Index_Model.deleteOne()
        return res.json({ message: "Đã xoá" })
    } catch (error) {
        return res.status(500).json(error)
    }
}

async function findAboutIndex(req: Request, res: Response) {
    const aboutindex = await About_Index_Model.find({})
    return res.json(aboutindex.map((item) => ({ ...item.toObject(), content: sanitizeRichHtml(item.content) })))
}

export const About_Index = {
    createAbout_Index,
    updateAbout_Index,
    deleteAbout_Index,
    findAboutIndex
}
