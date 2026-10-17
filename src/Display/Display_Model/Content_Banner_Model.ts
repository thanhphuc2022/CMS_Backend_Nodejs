import mongoose, { Schema, Document } from "mongoose";

interface Content_Banner extends Document {
    id: string,
    title: string,
    content: string,
    linkservices: string,
    images: string
}
const content_banner: Schema = new Schema<Content_Banner>({
    id: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String },
    linkservices: {type: String},
    images: { type: String, required: true },
}, { collection: 'Content_Banner' })
const Content_Banner_Model = mongoose.model<Content_Banner>('Content_Banner', content_banner);

export { Content_Banner, Content_Banner_Model }