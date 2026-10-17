import mongoose, { Schema, Document } from "mongoose";

interface News extends Document {
    id: string,
    title: string,
    slug: string,
    description: string,
    avatar: string,
    content: string,
    username: string,
    // Account: Object,
    views: number,
    // date: string,
    date:Date,
    typesid: string,
    tag: [string],
}

const newsSchema: Schema = new Schema<News>({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true, },
    slug: { type: String, required: true, },
    description: { type: String, required: false },
    avatar: { type: String, required: true, },
    content: { type: String, required: true, },
    username: { type: String, required: true, },
    // Account: { type: Schema.Types.ObjectId, ref: 'Accounts', required: true }, // Thêm trường account
    views: { type: Number, default: 0, },
    // date: { type: String, default: () => new Date().toLocaleDateString() },
    // date: {
    //     type: String, // Sử dụng kiểu string cho trường date
    //     default: () => dateFns.format(new Date(), 'dd/MM/yyyy'),
    // },
    date:{type: Date, default: Date.now},
    typesid: { type: String, ref: 'Types_News', required: true },
    tag: { type: [String], ref: 'Tag', required: false },
}, { collection: 'News' })

const NewsModel = mongoose.model<News>('News', newsSchema);

export { News, NewsModel }