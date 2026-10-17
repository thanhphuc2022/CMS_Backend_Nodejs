import mongoose, { Schema, Document } from "mongoose";
import { News } from "./News_Models";

interface Types_News extends Document {
    id: string,
    name: string,
    // order: number,
    news: News[],
}
const Categories_NewsSchema: Schema = new Schema<Types_News>({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    // order: { type: Number, required: true }
}, { collection: 'Types_News' });
const Types_News_Model = mongoose.model<Types_News>('Types_News', Categories_NewsSchema);
export default Types_News_Model;