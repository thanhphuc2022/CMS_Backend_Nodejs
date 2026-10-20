import { Request, Response } from "express";
import { PostModel } from "../Model/Post_Model";
import CategoriesModel from "../Model/Categories_Model";
import { NewsModel } from "../Model/News_Models";
import { uploadImageToCloudinary, randomStringPost, convertToSlug } from "../Services/sp";
import fs from "fs";
import { sanitizeRichHtml } from '../Security/html';
import { uploadImageBuffer, attachUploadedImages, cleanupResourceImages, extractCloudinaryImageUrls } from '../Services/cloudinaryAssets';

//UPLOAD HÌNH ẢNH LÊN CLOUDINARY KHI CHỌN HÌNH ẢNH TẠO BÀI VIẾT

export async function uploadImagesPost(req: Request, res: Response) {
    const fileBuffer = req.file?.buffer;
    if (!fileBuffer) {
        return res.status(400).json({ message: 'No file uploaded' });
    }
    try {
        const location = await uploadImageBuffer(fileBuffer, req.userId!);
        return res.json({ location });
    } catch {
        return res.status(500).json({ error: 'Upload failed' });
    }
}

//GET THÊM BÀI VIẾT
async function post(req: Request, res: Response) {
    // res.render('createpost')
    res.render('createpostLocal')
}

interface TempMulterFile extends Express.Multer.File {
    buffer: Buffer;
}

//POST THÊM BÀI VIẾT
async function createPost(req: Request, res: Response) {
    let thumbnailUrl: string | null = null;
    try {
        const { title, description, category, content } = req.body;
        if ([title, description, category, content].some((value) => typeof value !== 'string') ||
            title.length > 200 || description.length > 5000 || category.length > 100 || content.length > 500_000) {
            return res.status(400).json({ message: 'Invalid post data' });
        }
        const safeContent = sanitizeRichHtml(content);
        const linkfile = req.file as TempMulterFile;

        if (title == '' || description == '' || category == '' || content == '') {
            return res.json({ message: "Vui lòng điền đầy đủ thông tin" })
        }

        if (!linkfile) {
            return res.status(400).json({ error: 'No image provided.' });
        }

        const Cate = await CategoriesModel.findOne({ name: category })
        if (!Cate) {
            return res.json({ message: "Không tìm thấy Danh mục" })
        }
        //mã hóa slug
        const slug = convertToSlug(title);

        const idPost = await PostModel.findOne({ id: slug })
        var id
        if (!idPost) {
            id = slug
        } else {
            id = slug + '-' + randomStringPost
        }
        thumbnailUrl = await uploadImageToCloudinary(linkfile, req.userId)

        const newPost = await PostModel.create({
            id: id,//Id Post
            title: title,
            slug: id,
            description: description,
            avatar: thumbnailUrl,
            content: safeContent,
            // images: [publicId],
            // username: req.userId,
            username: "admindemo",
            categoryId: Cate.id,
        });
        await attachUploadedImages(req.userId!, 'post', id, safeContent, thumbnailUrl);

        // fs.unlink(linkfile.path, (err) => {
        //     if (err) {
        //         console.error('Error deleting uploaded file:', err);
        //     } else {
        //         console.log('Uploaded file deleted:', linkfile.path);
        //     }
        // });

        return res.json({ message: "Đã thêm bài viết", id });
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

//CẬP NHẬT BÀI VIẾT
async function updatePost(req: Request, res: Response) {
    let thumbnailUrl: string | null = null;
    try {
        const id = req.params.id;
        const { title, slug, description, content, category } = req.body;
        if ([title, slug, description, content, category].some((value) => typeof value !== 'string') ||
            title.length > 200 || slug.length > 250 || description.length > 5000 || category.length > 100 || content.length > 500_000) {
            return res.status(400).json({ message: 'Invalid post data' });
        }
        const safeContent = sanitizeRichHtml(content);
        const linkfile = req.file as TempMulterFile;

        // if (!linkfile) {
        //     return res.status(400).json({ error: 'No image provided.' });
        // }

        // if (title == '' || description == '' || category == '' || content == '' || linkfile == '') {
        //     deleteImageFromCloudinary(publicId)
        //     return res.json({ message: "Vui lòng điền đầy đủ thông tin" })
        // }

        const Cate = await CategoriesModel.findOne({ name: category })
        if (!Cate) {
            return res.json({ message: "Không tìm thấy Danh mục" })
        }

        if (!linkfile) {
            await PostModel.findOneAndUpdate({ id: id }, {
                title: title,
                slug: slug,
                description: description,
                content: safeContent,
                categoryId: Cate.id,
            })
            await attachUploadedImages(req.userId!, 'post', id, safeContent);
            return res.json({ message: "Cập nhật thành công", id })
        } else {
            thumbnailUrl = await uploadImageToCloudinary(linkfile, req.userId)
            await PostModel.findOneAndUpdate({ id: id }, {
                title: title,
                slug: slug,
                description: description,
                avatar: thumbnailUrl,
                content: safeContent,
                categoryId: Cate.id
            })
            await attachUploadedImages(req.userId!, 'post', id, safeContent, thumbnailUrl);
            await cleanupResourceImages('post', id, [...extractCloudinaryImageUrls(safeContent), thumbnailUrl]);
            return res.json({ message: "Cập nhật thành công", id })
        }
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' })
    }
}

//XÓA BÀI VIẾT
async function deletePost(req: Request, res: Response) {
    const id = req.params.id;
    try {
        const post = await PostModel.findOne({ id: id });
        await cleanupResourceImages('post', id);
        await PostModel.deleteOne({ id: id });
        return res.json({ message: "Đã xóa bài viết", id });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
}

//CHI TIẾT BÀI VIẾT
async function loadPost(req: Request, res: Response) {
    const postSlug = req.params.slug;
    const post = await PostModel.findOne({ slug: postSlug })
    if (!post) {
        res.status(505).json({ message: "Bài viết không tồn tại" });
    } else {
        // res.render('post', { post: post });
        return res.json({ ...post.toObject(), content: sanitizeRichHtml(post.content) })
    }
}

//CHI TIẾT BÀI VIẾT THEO ID
async function loadPostId(req: Request, res: Response) {
    const id = req.params.id;
    const post = await PostModel.findOne({ id: id })
    if (!post) {
        res.status(505).json({ message: "Bài viết không tồn tại" });
    } else {
        // res.render('post', { post: post });
        return res.json({ ...post.toObject(), content: sanitizeRichHtml(post.content) })
    }
}

//HIỂN THỊ TẤT CẢ BÀI VIẾT
async function loadAllPost(req: Request, res: Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 9;
    const startIndex = (page - 1) * limit;
    try {
        const posts = await PostModel.find().select('id title slug description avatar date views username').skip(startIndex).limit(limit)
        const totalPosts = await PostModel.countDocuments().exec();

        const paginationResult = {
            data: posts,
            total: totalPosts,
            pages: Math.ceil(totalPosts / limit),
            currentPage: page,
            limit: limit
        }
        res.json(paginationResult)
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
}

//TÌM KIẾM BÀI VIẾT THEO USERNAME
async function loadPost_Username(req: Request, res: Response) {
    try {
        const post = await PostModel.find({
            username: req.userId
        })
        return res.json(post);
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
}

//DANH SÁCH BÀI VIẾT THEO LOẠI
async function loadPost_Categories(req: Request, res: Response) {
    const categorieId = req.params.id
    try {
        const post = await PostModel.find({ categoryId: categorieId })
        //        const category = await CategoriesModel.findOne({ id: categorieId })
        return res.json(post);
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
}

//TOP 4 BÀI VIẾT THEO DICH VU
async function top4_LoadPost_Dichvu(req: Request, res: Response) {
    try {
        const top5LatestPost = await PostModel.find({ categoryId: 'Dich-vu' })
            .sort({ date: -1 })
            .limit(4)
            .select('id title slug avatar')
            .exec();
        res.json(top5LatestPost);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

//TOP 4 BÀI VIẾT THEO GIAI PHAP
async function top4_LoadPost_Giaiphap(req: Request, res: Response) {
    try {
        const top5LatestPost = await PostModel.find({ categoryId: 'Giai-phap' })
            .sort({ date: -1 })
            .limit(4)
            .select('id title slug avatar')
            .exec();
        res.json(top5LatestPost);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

//HIỂN THỊ LƯỢT XEM
async function loadViews(req: Request, res: Response) {
    const postId = req.params.id;
    const post = await PostModel.findOne({ id: postId })
    if (!post) {
        return res.status(505).json("Bài viết không tồn tại");
    } else {
        return res.json(`Số lượt xem của bài đăng ${postId}: ${post.views}`);
    }
}

//ĐẾM LƯỢT XEM
const countViews = async (req: Request, res: Response) => {
    const postId = req.params.id;
    const post = await PostModel.findOne({ id: postId })
    if (!post) {
        return res.status(505).json("Bài viết không tồn tại");
    } else {
        await PostModel.findOneAndUpdate({ id: postId }, { $inc: { views: 1 } })
        return res.json(`Số lượt xem của bài đăng ${postId}: ${post.views}`);
    }
}

//ALL SLUG Post
async function AllSlugPost(req: Request, res: Response) {
    const post = await PostModel.find().select('id');
    return res.json(post)
}
//ALL SLUG POST_NEW
async function AllSlugPost_News(req: Request, res: Response) {
    const post = await PostModel.find({}, 'id');
    const news = await NewsModel.find({}, 'id');
    return res.json({
        post, news
    });
}

export const Post = {
    post,
    createPost,
    updatePost,
    deletePost,
    loadPost,
    loadPostId,
    loadAllPost,
    loadPost_Username,
    loadPost_Categories,
    top4_LoadPost_Dichvu,
    top4_LoadPost_Giaiphap,
    loadViews,
    countViews,
    AllSlugPost,
    AllSlugPost_News,
    uploadImagesPost,
}
