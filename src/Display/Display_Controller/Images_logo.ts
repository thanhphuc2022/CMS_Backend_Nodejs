import { Request, Response } from "express";
import { uploadImageToCloudinary, deleteImageFromCloudinary} from "../../Services/sp"
import Images_logo_Model from "../Display_Model/Images_logo_Model";
import { getPublicIdFromUrl } from "../../Services/sp";

interface TempMulterFile extends Express.Multer.File {
    buffer: Buffer;
}

async function createImageLogo(req: Request, res: Response) {
    let images_about_index: string | null = null;
    const link_image_about = req.file as TempMulterFile;
    if (!link_image_about) {
        return res.status(400).json("No image provided.")
    } else {
        images_about_index = await uploadImageToCloudinary(link_image_about);
        //lấy public_id của hình ảnh-lưu vào cloud
        const public_id = getPublicIdFromUrl(images_about_index)
        //lưu vào database
        await Images_logo_Model.create({
            link_Images: images_about_index,
            public_id: public_id,
        })
        return res.json({ message: "Thêm hình ảnh thành công" })
    }
}

async function allImagaLogo(req: Request, res: Response) {
    const allImagaAboutIndex = await Images_logo_Model.find({});
    return res.json(allImagaAboutIndex)
}

async function deleteImageLogo(req: Request, res: Response) {
    try {
        const idImage = req.params.id;
        const images = await Images_logo_Model.findOne({ public_id: idImage })
        const deleteimages = images?.link_Images
        if (deleteimages) {
            const urlObject = new URL(deleteimages);
            const path = urlObject.pathname;
            const x = path.substring(path.indexOf('Tinhocnhuy/'), path.lastIndexOf('.'));
            await deleteImageFromCloudinary(x)
        }
        await Images_logo_Model.deleteOne({ public_id: idImage })
        return res.json("Đã xoá")
    } catch (error) {
        console.log(error)
        return res.status(400).json({ message: "Lỗi ???" })
    }
}

export const Images_logo_Index = {
    createImageLogo,
    deleteImageLogo,
    allImagaLogo,
}