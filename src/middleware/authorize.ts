import { Request, Response, NextFunction } from "express";
import AccountModel from "../Model/Account_Model";

export async function authorize(req: Request, res: Response, next: NextFunction) {
    try {
        const account = await AccountModel.findOne({ username: req.userId }, 'role');
        if (!account || account.role !== true) {
            return res.status(403).send('Từ chối truy cập.');
        }
        return next();
    } catch (error) {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}
