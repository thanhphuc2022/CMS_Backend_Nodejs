import mongoose, { Schema, Document } from "mongoose";
import { Post } from "./Post_Model";

interface Categories extends Document {
    id: string,
    name: string,
    post: Post[],
}
const CategoriesSchema: Schema = new Schema<Categories>({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true }
}, { collection: 'Categories' }
);

const CategoriesModel = mongoose.model<Categories>('Categories', CategoriesSchema);

export default CategoriesModel;