import mongoose, { Document, Schema } from 'mongoose';

export type ChallengePurpose = 'registration' | 'password-reset';

export interface SecurityChallenge extends Document {
    challengeId: string;
    purpose: ChallengePurpose;
    email: string;
    otpDigest: string;
    attempts: number;
    expiresAt: Date;
    consumedAt?: Date;
    accountId?: string;
    username?: string;
    fullname?: string;
    passwordHash?: string;
}

const schema = new Schema<SecurityChallenge>({
    challengeId: { type: String, required: true, unique: true },
    purpose: { type: String, required: true, enum: ['registration', 'password-reset'] },
    email: { type: String, required: true },
    otpDigest: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
    accountId: { type: String },
    username: { type: String },
    fullname: { type: String },
    passwordHash: { type: String }
}, { collection: 'SecurityChallenges', timestamps: true });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SecurityChallengeModel = mongoose.model<SecurityChallenge>('SecurityChallenge', schema);
