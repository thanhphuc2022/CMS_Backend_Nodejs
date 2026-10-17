import { Request, Response } from 'express';
import CategoriesModel from '../Model/Categories_Model';
import { randomStringPost, convertToSlug } from '../Services/sp';

async function createCategories(req: Request, res: Response) {
    const name = req.body.name;
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 200) {
        return res.status(400).json({ message: 'Tên danh mục không hợp lệ' });
    }
    try {
        const id = convertToSlug(name);
        const existing = await CategoriesModel.findOne({ id });
        const newIdCategory = existing ? `${id}-${randomStringPost}` : id;
        await CategoriesModel.create({ id: newIdCategory, name });
        return res.json({ message: 'Tạo Danh Mục thành công', newIdCategory });
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

async function updateCategories(req: Request, res: Response) {
    const { id } = req.params;
    const { name } = req.body;
    if (typeof id !== 'string' || id.length > 250 || typeof name !== 'string' || !name.trim() || name.length > 200) {
        return res.status(400).json({ message: 'Dữ liệu danh mục không hợp lệ' });
    }
    try {
        await CategoriesModel.findOneAndUpdate({ id }, { name });
        return res.json({ message: 'Cập nhật thành công', id });
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

async function deleteCategories(req: Request, res: Response) {
    const { id } = req.params;
    if (typeof id !== 'string' || id.length > 250) return res.status(400).json({ message: 'Mã danh mục không hợp lệ' });
    try {
        await CategoriesModel.findOneAndDelete({ id });
        return res.json({ message: 'Đã xóa danh mục', id });
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

async function loadCategories(req: Request, res: Response) {
    const { name } = req.body;
    if (typeof name !== 'string' || name.length > 200) return res.status(400).json({ message: 'Tên danh mục không hợp lệ' });
    try {
        const categorie = await CategoriesModel.findOne({ name });
        return res.json(categorie?.name);
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

async function loadAllCategories(req: Request, res: Response) {
    try {
        return res.json(await CategoriesModel.find({}));
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

export const Categories = { createCategories, updateCategories, deleteCategories, loadCategories, loadAllCategories };