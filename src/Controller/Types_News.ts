import { Request, Response } from 'express';
import Types_News_Model from '../Model/Types_News_Models';
import { convertToSlug } from '../Services/sp';

async function createTypes_News(req: Request, res: Response) {
    const { name } = req.body;
    if (typeof name !== 'string' || !name.trim() || name.length > 200) {
        return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin' });
    }
    try {
        const id = convertToSlug(name);
        const existing = await Types_News_Model.findOne({ id });
        if (existing) return res.json({ message: 'Danh mục đã tồn tại' });
        await Types_News_Model.create({ id, name });
        return res.json({ message: 'Tạo danh mục bài viết thành công', id });
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

async function updateTypes_News(req: Request, res: Response) {
    const { id } = req.params;
    const { name } = req.body;
    if (typeof id !== 'string' || id.length > 250 || typeof name !== 'string' || !name.trim() || name.length > 200) {
        return res.status(400).json({ message: 'Dữ liệu danh mục không hợp lệ' });
    }
    try {
        await Types_News_Model.findOneAndUpdate({ id }, { name });
        return res.json({ message: 'Cập nhật thành công', id });
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

async function deleteType_News(req: Request, res: Response) {
    const { id } = req.params;
    if (typeof id !== 'string' || id.length > 250) return res.status(400).json({ message: 'Mã danh mục không hợp lệ' });
    try {
        await Types_News_Model.findOneAndDelete({ id });
        return res.json({ message: 'Đã xóa danh mục bài viết', id });
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

async function loadTypes_News(req: Request, res: Response) {
    const { name } = req.body;
    if (typeof name !== 'string' || name.length > 200) return res.status(400).json({ message: 'Tên danh mục không hợp lệ' });
    try {
        const type = await Types_News_Model.findOne({ name });
        return res.json(type?.name);
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

async function loadTypes_News2(req: Request, res: Response) {
    const { name } = req.body;
    if (typeof name !== 'string' || name.length > 250) return res.status(400).json({ message: 'Mã danh mục không hợp lệ' });
    try {
        const type = await Types_News_Model.findOne({ id: name });
        return res.json(type?.name);
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

async function loadAllType_News(req: Request, res: Response) {
    try {
        return res.json(await Types_News_Model.find({}));
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

async function getSortedData(priorityId: string) {
    const data = await Types_News_Model.find({});
    return data.sort((a, b) => a.id === priorityId ? -1 : b.id === priorityId ? 1 : 0);
}

async function sort(req: Request, res: Response) {
    const { id } = req.params;
    if (typeof id !== 'string' || id.length > 250) return res.status(400).json({ message: 'Mã danh mục không hợp lệ' });
    try {
        return res.json(await getSortedData(id));
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

export const Types_News = { createTypes_News, updateTypes_News, deleteType_News, loadTypes_News, loadAllType_News, sort };