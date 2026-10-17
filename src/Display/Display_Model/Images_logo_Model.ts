import mongoose, { Schema, Document } from "mongoose";

interface Images_logo extends Document {
    link_Images: string,
    public_id: string,
}

const Images_logoSchema: Schema = new Schema<Images_logo>({
    link_Images: { type: String, required: true },
    public_id: { type: String, required: true },
}, { collection: 'Images_logo' });
const Images_logo_Model = mongoose.model<Images_logo>('Images_logo', Images_logoSchema);
export default Images_logo_Model;