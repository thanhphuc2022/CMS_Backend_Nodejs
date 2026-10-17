import mongoose, { Collection, ObjectId, Document } from "mongoose";
import { Schema } from "mongoose";

interface Account extends Document {
    username: string,
    fullname: string,
    role: boolean,
    email: string,
    password: string,
    refreshtoken: string
}

const accountSchema: Schema = new Schema<Account>({
    username: { type: String, required: true },
    fullname: { type: String, required: true },
    role: { type: Boolean, default: false },
    email: { type: String, required: true },
    password: { type: String, required: true, unique: false },
    refreshtoken: { type: String, }
}, { collection: 'Accounts' }
);

const AccountModel = mongoose.model<Account>('Accounts', accountSchema);

export default AccountModel;
