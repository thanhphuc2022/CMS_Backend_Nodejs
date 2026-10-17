import { Request, Response } from "express";
import ContactModel from "../Display_Model/Contact_Model";

async function getContact(req: Request, res: Response) {
    try {
        const contact = await ContactModel.find({})
        return res.json({contact})
    } catch (error) {
        return res.json(error)
    }
}

async function createContact(req: Request, res: Response) {
    try {
        const contact = req.body.contact;
        const map = req.body.map;
        if (typeof contact !== 'string' || typeof map !== 'string' || !contact || !map || contact.length > 500 || map.length > 2000) {
            return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" })
        } else {
           await ContactModel.create({
                // id: 'CT',
                contact: contact,
                map: map
            })
            return res.json({ message: "Thêm thành công" })
        }
    } catch (error) {
        return res.status(500).json({ message: 'Lỗi máy chủ' })
    }
}

async function updateContact(req: Request, res: Response) {
    try {
        const contact = req.body.contact;
        const map = req.body.map;
        if (typeof contact !== 'string' || typeof map !== 'string' || !contact || !map || contact.length > 500 || map.length > 2000) {
            return res.status(400).json({ error: "Vui lòng điền đầy đủ thông tin" })
        } else {
           await ContactModel.updateOne({
                contact: contact,
                map: map
            })
            return res.json({ message: "Cập nhật thành công" })
        }
    } catch (error) {
        return res.status(500).json({ message: 'Lỗi máy chủ' })
    }
}

export const Contact = {
    getContact,
    createContact,
    updateContact
}
