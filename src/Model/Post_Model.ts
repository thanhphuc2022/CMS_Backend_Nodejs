import mongoose, { Schema, Document } from "mongoose";
import * as dateFns from 'date-fns';

interface Post extends Document {
    id: string,
    title: string,
    slug: string,
    description: string,
    avatar: string,
    content: string,
    username: string,
    views: number,
    date: Date,
    categoryId: string,
}
const postSchema: Schema = new Schema<Post>({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    slug: { type: String, required: true, },
    description: { type: String, required: true },
    avatar: { type: String, required: true },
    content: { type: String, required: true },
    username: { type: String, required: true },
    views: { type: Number, default: 0 },
    // date: { type: String, default: () => new Date().toLocaleDateString() },
    date:{type: Date, default: Date.now},
    categoryId: { type: String, ref: 'Category', required: true },
}, {
    collection: 'Post',
    // timestamps: true //hỗ trợ định dạng ngày tạo, ngày cập nhật 
});

const PostModel = mongoose.model<Post>('Post', postSchema);

// export default PostModel; 
export { Post, PostModel }