import mongoose, { Schema, Document } from "mongoose";
import { News } from "./News_Models";

interface Tag extends Document {
    name: string,
    news: News[],
}
const TagSchema: Schema = new Schema<Tag>({
    name: { type: String, required: true },
}, { collection: 'Tag' });
const TagModel = mongoose.model<Tag>('Tag', TagSchema);
export default TagModel;