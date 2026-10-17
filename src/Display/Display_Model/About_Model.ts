import mongoose, { Schema, Document } from "mongoose";

interface About extends Document {
    id: string,
    title: string,
    content: string,
    images: string,
}

const about: Schema = new Schema<About>({
    id: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    images: { type: String, required: true },
}, { collection: 'About' })
const About_Model = mongoose.model<About>('About', about);

export { About, About_Model }