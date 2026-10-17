import AccountModel from "../Model/Account_Model";
import { Request, Response } from "express";

async function AllAccount(req: Request, res: Response) {
    const account = await AccountModel.find({}).select('username fullname email role')
    return res.json(account)
}

async function updateRole(req: Request, res: Response) {
    try {
        const username = req.params.username;
        const role = req.body.role;
        if (typeof username !== 'string' || username.length > 100 || typeof role !== 'boolean') {
            return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
        }
        if (req.userId == username) {
            return res.status(400).json("Bạn đang là Admin!!!")
        } else {
            await AccountModel.findOneAndUpdate({ username: username },
                {
                    role: role
                })
            return res.json({ message: "Cập nhật thành công" })
        }
    } catch (error) {
            return res.status(500).json({ message: 'Lỗi máy chủ' })
    }

}

async function deleteAccount(req: Request, res: Response) {
    
    try {
        const username=req.params.username;
        if (typeof username !== 'string' || username.length > 100) return res.status(400).json({ message: 'Tài khoản không hợp lệ' });
        if(req.userId==username){
            return res.status(400).json("Lỗi ???")
        }else{
            await AccountModel.findOneAndDelete({username:username})
            return res.json({ message: "Đã xoá" })
        }
    } catch (error) {
            return res.status(500).json({ message: 'Lỗi máy chủ' })
    }
}

export const Authentication = {
    AllAccount,
    updateRole,
    deleteAccount
}
