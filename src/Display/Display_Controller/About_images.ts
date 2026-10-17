import { Request, Response } from "express";
import About_images_Model from "../Display_Model/About_images_Model";
import { uploadImageToCloudinary, deleteImageFromCloudinary, getPublicIdFromUrl } from "../../Services/sp"

interface TempMulterFile extends Express.Multer.File {
    buffer: Buffer;
}

async function createAboutImages(req: Request, res: Response) {
    let link: string | null = null;
    const link_image = req.file as TempMulterFile;
    if (!link_image) {
        return res.status(400).json("No image provided.")
    } else {
        link = await uploadImageToCloudinary(link_image);
        //lấy public_id của hình ảnh-lưu vào cloud
        const public_id = getPublicIdFromUrl(link)
        //lưu vào database
        await About_images_Model.create({
            link_images: link,
            public_id: public_id,
        })
        return res.json({ message: "Thêm hình ảnh thành công" })
    }
}

async function deleteAboutImages(req: Request, res: Response) {
    try {
        const idImage = req.params.id;
        const images = await About_images_Model.findOne({ public_id: idImage })
        const deleteimages = images?.link_images
        if (deleteimages) {
            const urlObject = new URL(deleteimages);
            const path = urlObject.pathname;
            const x = path.substring(path.indexOf('Tinhocnhuy/'), path.lastIndexOf('.'));
            await deleteImageFromCloudinary(x)
        }
        await About_images_Model.deleteOne({ public_id: idImage })
        return res.json("Đã xoá")
    } catch (error) {
        console.log(error)
        return res.status(400).json({ message: "Lỗi ???" })
    }
}

async function allAboutImages(req: Request, res: Response) {
    const allImagaAboutIndex = await About_images_Model.find({});
    return res.json(allImagaAboutIndex)
}

export const About_Images={
    createAboutImages,
    deleteAboutImages,
    allAboutImages
}