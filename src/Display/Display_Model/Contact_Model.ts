import mongoose, { Schema, Document } from "mongoose";

interface Contact extends Document {
    // id: string
    contact: string,
    map: string
}

const contactSchema: Schema = new Schema<Contact>({
    // id: { type: String, required: true },
    contact: { type: String, required: true },
    map: { type: String, required: true }
}, { collection: 'Contact' });

const ContactModel = mongoose.model<Contact>('Contact', contactSchema);
export default ContactModel