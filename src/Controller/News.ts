import { Request, Response } from "express";
import { randomStringPost } from "../Services/sp";
import { NewsModel } from "../Model/News_Models";
import Types_News_Model from "../Model/Types_News_Models"
import { uploadImageToCloudinary, convertToSlug} from "../Services/sp"
import { sanitizeRichHtml } from '../Security/html';
import { uploadImageBuffer, prepareUpdatedImageReferences } from '../Services/cloudinaryAssets';
import { createContentWithImages, ContentCreationUncertain } from '../Services/createContentWithImages';

//UPLOAD HÌNH ẢNH LÊN CLOUDINARY KHI CHỌN HÌNH ẢNH TẠO BÀI VIẾT

export async function uploadImagesNews(req: Request, res: Response) {
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

//THÊM TIN TỨC
async function get_CreateNews(req: Request, res: Response) {
    res.render('createNews.ejs')
}

interface TempMulterFile extends Express.Multer.File {
    buffer: Buffer;
}

async function post_CreateNews(req: Request, res: Response) {
    try {
        const title = req.body.title;
        const description = req.body.description;
        const linkfile = req.file as TempMulterFile;
        const content = req.body.content;
        const nametypes = req.body.types;
        const tag = req.body.tag;
        if ([title, description, content, nametypes].some((value) => typeof value !== 'string') ||
            title.length > 200 || description.length > 5000 || content.length > 500_000 || nametypes.length > 100 ||
            (tag !== undefined && tag !== null && typeof tag !== 'string' &&
                (!Array.isArray(tag) || tag.some((item: unknown) => typeof item !== 'string' || item.length > 100)))) {
            return res.status(400).json({ message: 'Invalid news data' });
        }
        const safeContent = sanitizeRichHtml(content);

        if (title == '' || description == '' || content == '' || nametypes == '') {
            return res.json({ message: "Vui lòng điền đầy đủ thông tin" })
        }

        if (!linkfile) {
            return res.status(400).json({ error: 'No image provided.' });
        }

        const types = await Types_News_Model.findOne({ name: nametypes })
        if (!types) {
            return res.json({ message: "Không tìm thấy danh mục bài viết" })
        }
        //mã hóa slug
        const slug = convertToSlug(title)

        const idNews = await NewsModel.findOne({ id: slug })
        var id
        if (!idNews) {
            id = slug
        } else {
            id = slug + '-' + randomStringPost
        }
        await createContentWithImages(NewsModel, 'news', req.userId!, {
            id: id,//Id Post
            title: title,
            slug: id,
            description: description,
            content: safeContent,
            username: req.userId,
            // username: "admindemo",
            // account: accountId,
            typesid: types.id,
            tag: tag
        }, linkfile);
        // return res.json(newPost);

        // fs.unlink(linkfile.path, (err) => {
        //     if (err) {
        //         console.error('Error deleting uploaded file:', err);
        //     } else {
        //         console.log('Uploaded file deleted:', linkfile.path);
        //     }
        // });

        return res.json({ message: "Thêm thành công", id })
    } catch (error) {
        if (error instanceof ContentCreationUncertain) {
            return res.status(503).json({ message: 'Creation outcome unknown; check the article before retrying', id: error.resourceId, creationStatus: 'unknown' });
        }
        return res.status(500).json({ message: 'Internal server error' });
    }
}

//CẬP NHẬT TIN TỨC
async function updateNews(req: Request, res: Response) {
    let thumbnailUrl: string | null = null;
    let writeStarted = false;
    try {
        const id = req.params.id;
        const { title, slug, description, content, tag } = req.body;
        const nametypes = req.body.types;
        const linkfile = req.file as TempMulterFile;
        if ([title, slug, description, content, nametypes].some((value) => typeof value !== 'string') ||
            title.length > 200 || slug.length > 250 || description.length > 5000 || content.length > 500_000 || nametypes.length > 100 ||
            (tag !== undefined && tag !== null && typeof tag !== 'string' &&
                (!Array.isArray(tag) || tag.some((item: unknown) => typeof item !== 'string' || item.length > 100)))) {
            return res.status(400).json({ message: 'Invalid news data' });
        }
        const safeContent = sanitizeRichHtml(content);
        const existing = await NewsModel.findOne({ id });
        if (!existing) return res.status(404).json({ message: 'Resource not found' });
        // if (title == '' || description == '' || content == '' || linkfile == '' || nametypes == '') {
        //     deleteImageFromCloudinary(publicId)
        //     return res.json({ message: "Vui lòng điền đầy đủ thông tin" })
        // }

        // if (!linkfile) {
        //     return res.status(400).json({ error: 'No image provided.' });
        // }

        const types = await Types_News_Model.findOne({ name: nametypes })
        if (!types) {
            return res.json({ message: "Không tìm thấy Loại tin tức" })
        }
        // const findtag = await TagModel.findOne({ name: tag })
        // if (!findtag) {
        //     deleteImageFromCloudinary(publicId)
        //     return res.json({ message: "Không tìm thấy Tag" })
        // }
        // else {
        // }

        if (!linkfile) {
            await prepareUpdatedImageReferences(req.userId!, 'news', id, safeContent, existing.avatar);
            writeStarted = true;
            const updated = await NewsModel.findOneAndUpdate({ _id: existing._id, avatar: existing.avatar }, {
                title: title,
                slug: slug,
                description: description,
                content: safeContent,
                typesid: types.id,
                tag: tag
            }, { new: true });
            if (!updated) return res.status(409).json({ message: 'Resource changed; reload before updating' });
            return res.json({ message: "Cập nhật thành công", id })
        } else {
            thumbnailUrl = await uploadImageToCloudinary(linkfile, req.userId);
            await prepareUpdatedImageReferences(req.userId!, 'news', id, safeContent, thumbnailUrl, true);
            writeStarted = true;
            const updated = await NewsModel.findOneAndUpdate({ _id: existing._id, avatar: existing.avatar }, {
                title: title,
                slug: slug,
                description: description,
                avatar: thumbnailUrl,
                content: safeContent,
                typesid: types.id,
                tag: tag
            }, { new: true });
            if (!updated) return res.status(409).json({ message: 'Resource changed; reload before updating' });
            return res.json({ message: "Cập nhật thành công", id })
        }
    } catch (error) {
        console.warn('News update interrupted; images and registry retained');
        if (writeStarted) return res.status(503).json({ message: 'Update outcome unknown; reload before retrying', id: req.params.id, updateStatus: 'unknown' });
        return res.status(500).json({ message: 'Internal server error' })
    }
}

//XÓA TIN TỨC
async function deleteNews(req: Request, res: Response) {
    const id = req.params.id;
    let deleteStarted = false;
    try {
        const post = await NewsModel.findOne({ id: id });
        if (!post) return res.status(404).json({ message: 'Resource not found' });
        deleteStarted = true;
        // Physical image cleanup and registry removal are deferred (race 3B).
        const result = await NewsModel.deleteOne({ _id: post._id });
        if (!result.acknowledged) return res.status(503).json({ message: 'Delete outcome unknown; reload before retrying', id, deleteStatus: 'unknown' });
        if (result.deletedCount !== 1) return res.status(404).json({ message: 'Resource not found' });
        return res.json({ message: "Đã xóa bài viết", id });
    } catch (error) {
        console.warn('News deletion interrupted; images and registry retained');
        if (deleteStarted) return res.status(503).json({ message: 'Delete outcome unknown; reload before retrying', id, deleteStatus: 'unknown' });
        res.status(500).json({ message: 'Internal server error' });
    }
}

//HIỂN THỊ CHI TIẾT TIN TỨC
async function loadNews(req: Request, res: Response) {
    const newsSlug = req.params.slug
    const news = await NewsModel.findOne({ slug: newsSlug })
    if (!news) {
        res.status(505).json({ message: "Bài viết không tồn tại" });
    } else {
        // res.render('news.ejs', { news: news.content })
        return res.json({ ...news.toObject(), content: sanitizeRichHtml(news.content) })
    }
}

//HIỂN THỊ CHI TIẾT TIN TỨC THEO ID
async function loadNewsId(req: Request, res: Response) {
    const id = req.params.id
    const news = await NewsModel.findOne({ id: id })
    if (!news) {
        res.status(505).json({ message: "Bài viết không tồn tại" });
    } else {
        // res.render('news.ejs', { news: news.content })
        return res.json({ ...news.toObject(), content: sanitizeRichHtml(news.content) })
    }
}

// DANH SÁCH TẤT CẢ BÀI VIẾT
async function loadAllNews(req: Request, res: Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 8;
    const startIndex = (page - 1) * limit;

    try {
        // Lấy tất cả bài viết và phân trang
        const news = await NewsModel.find({})
            .select('id title slug description avatar date')
            .sort({ date: -1 })
            .lean()
            .skip(startIndex)
            .limit(limit)
            .exec();

        // Đếm tổng số bài viết
        const totalArticles = await NewsModel.countDocuments().exec();

        //         // Định dạng trường ngày trong kết quả
        const formattedResult = news.map(item => ({
            ...item,
            date: item.date instanceof Date ? item.date.toISOString().split('T')[0] : item.date,
        }));

        // Tính toán thông tin phân trang
        const totalPages = Math.ceil(totalArticles / limit);
        const currentPage = Math.min(page, totalPages);

        // Trả về kết quả phân trang
        const paginationResult = {
            data: formattedResult,
            total: totalArticles,
            pages: totalPages,
            currentPage: currentPage,
            limit: limit
        };
        return res.json(paginationResult);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}


//HIỂN THỊ NGẪU NHIÊN TIN TỨC
async function loadRandomNews(req: Request, res: Response) {
    try {
        const numberOfRecords = 5;
        const news = await NewsModel.aggregate([
            { $sample: { size: numberOfRecords } },
            { $limit: numberOfRecords },
            { $project: { _id: 0, title: 1, description: 1, avatar: 1 } }
        ])
        return res.json(news)
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

//DANH SÁCH BÀI VIẾT THEO DANH MỤC
async function loadNews_Types(req: Request, res: Response) {
    const typesid = req.params.id

    const page = parseInt(req.query.page as string) || 1;
    const limit = 8
    const startIndex = (page - 1) * limit;

    try {
        const news = await NewsModel.find({ typesid: typesid }).select('id title slug description avatar date').sort({ date: -1 }).lean().skip(startIndex).limit(limit).exec();

        // Đếm tổng số bài viết
        const totalArticles = await NewsModel.countDocuments({ typesid: typesid }).exec();

        // Định dạng trường ngày trong kết quả
        const formattedResult = news.map(item => ({
            ...item,
            date: item.date instanceof Date ? item.date.toISOString().split('T')[0] : item.date,
        }));

        // Tính toán thông tin phân trang
        const totalPages = Math.ceil(totalArticles / limit);
        const currentPage = Math.min(page, totalPages);

        if (news.length === 0 && currentPage > 1) {
            return res.status(404).json({ message: 'Page not found' });
        }

        // const totalPages = await NewsModel.countDocuments().exec();
        const paginationResult = {
            data: formattedResult,
            total: totalArticles,
            // pages: Math.ceil(totalPages / limit),
            pages: totalPages,
            currentPage: currentPage,
            limit: limit
        };
        return res.json(paginationResult);
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
}

//DANH SÁCH BÀI VIẾT THEO TAG
async function LoadNews_Tag(req: Request, res: Response) {
    const tagid = req.params.id

    const page = parseInt(req.query.page as string) || 1;
    const limit = 8;
    const startIndex = (page - 1) * limit;
    try {
        const tag = await NewsModel.find({ tag: tagid }).select('id title slug description avatar date').lean().skip(startIndex).limit(limit).exec();

        // Đếm tổng số bài viết
        const totalArticles = await NewsModel.countDocuments({ tag: tagid }).exec();

        // Tính toán thông tin phân trang
        const totalPages = Math.ceil(totalArticles / limit);
        const currentPage = Math.min(page, totalPages);

        if (tag.length === 0 && currentPage > 1) {
            return res.status(404).json({ message: 'Page not found' });
        }

        const paginationResult = {
            data: tag,
            total: totalArticles,
            pages: totalPages,
            currentPage: currentPage,
            limit: limit
        };
        return res.json(paginationResult)
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
}

//HIỂN THỊ 5 BÀI VIẾT CÓ NHIỀU LƯỢT XEM NHẤT TRONG NGÀY
async function LoadNews_Top5_ViewstoDay(req: Request, res: Response) {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Lấy ngày hiện tại và đặt giờ về 00:00:00
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1); // Ngày tiếp theo

        const topPosts = await NewsModel.find({ date: { $gte: today.toLocaleDateString(), $lt: tomorrow.toLocaleDateString() } })
            .sort({ views: -1 })
            .limit(5);
        return res.json(topPosts)
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
}

//HIỂN THỊ TOP 5 BÀI VIẾT CÓ LƯỢT XEM NHIỀU NHẤT TỪ TRƯỚC TỚI NAY
async function Top5Views(req: Request, res: Response) {
    try {
        const topPosts = await NewsModel.find()
            .sort({ views: -1 })
            .limit(5);
        return res.json(topPosts);
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
}

//HIỂN THỊ TOP 5 BÀI VIẾT MỚI NHẤT
async function top5LatestNews(req: Request, res: Response) {
    try {
        // const top5LatestNews = await NewsModel.find()
        //     .sort({ date: -1 }) // Sắp xếp giảm dần theo trường "date"
        //     .limit(5) // Giới hạn chỉ lấy 5 bài viết
        //     .select('id title description avatar date')
        //     .exec();
        const top5LatestNews = await NewsModel.find({}, 'id title slug description avatar date')
            .sort({ date: -1 }) //.sort({ date: -1 })
            .limit(5)
            .lean()
            .exec();

        const formattedResult = top5LatestNews.map(item => ({
            ...item,
            date: item.date instanceof Date ? item.date.toISOString().split('T')[0] : item.date,
        }));

        res.json(formattedResult);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}

//HIỂN THỊ LƯỢT XEM
async function loadViews(req: Request, res: Response) {
    const newsId = req.params.id;
    const news = await NewsModel.findOne({ id: newsId })
    if (!news) {
        return res.status(505).json("Bài viết không tồn tại");
    } else {
        return res.json(`Số lượt xem của bài viết ${newsId}: ${news.views}`)
    }
}

//ĐẾM LƯỢT XEM
async function countViews(req: Request, res: Response) {
    const newsId = req.params.id;
    const news = await NewsModel.findOne({ id: newsId })
    if (!news) {
        return res.status(505).json("Bài viết không tồn tại");
    } else {
        await NewsModel.findOneAndUpdate({ id: newsId }, { $inc: { views: 1 } })
        return res.json(`Số lượt xem của bài viết ${newsId}: ${news.views}`)
    }
}

//ALLSLUGNEWS
async function AllSlugNews(req: Request, res: Response) {
    const news = await NewsModel.find().select('id');
    return res.json(news);
}

//Test convert slug
async function Testslug(req: Request, res: Response) {
    const slug= req.body.slug;
    if (typeof slug !== 'string' || slug.length > 500) return res.status(400).json({ message: 'Invalid slug' });
    const return_slug =convertToSlug(slug)
    return res.json(return_slug)
}

export const News = {
    get_CreateNews,
    post_CreateNews,
    updateNews,
    deleteNews,
    loadNews,
    loadNewsId,
    loadAllNews,
    loadRandomNews,
    loadNews_Types,
    LoadNews_Tag,
    LoadNews_Top5_ViewstoDay,
    Top5Views,
    top5LatestNews,
    loadViews,
    countViews,
    AllSlugNews,
    uploadImagesNews,
    Testslug
}
