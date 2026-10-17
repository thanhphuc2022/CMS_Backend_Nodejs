import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { CONFIG } from '../config/config';
import { SecurityChallengeModel, ChallengePurpose } from '../Model/SecurityChallenge_Model';
import { sendOtpEmail } from '../Services/mailer';
import { takeRateLimit } from './rateLimit';

const OTP_TTL_MS = 60_000;
const MAX_ATTEMPTS = 5;
const OTP_RATE_WINDOW_MS = 15 * 60_000;

function digestOtp(challengeId: string, purpose: ChallengePurpose, otp: string): string {
    return createHmac('sha256', CONFIG.jwt.refresh)
        .update(`${challengeId}:${purpose}:${otp}`)
        .digest('hex');
}

interface NewChallenge {
    purpose: ChallengePurpose;
    email: string;
    accountId?: string;
    username?: string;
    fullname?: string;
    passwordHash?: string;
}

export async function issueOtpChallenge(input: NewChallenge): Promise<string> {
    const allowed = await takeRateLimit(`otp-send:${input.purpose}:${input.email}`, 3, OTP_RATE_WINDOW_MS);
    if (!allowed) throw new Error('OTP_RATE_LIMIT');

    const challengeId = randomUUID();
    const otp = String(randomInt(100_000, 1_000_000));
    await SecurityChallengeModel.create({
        ...input,
        challengeId,
        otpDigest: digestOtp(challengeId, input.purpose, otp),
        attempts: 0,
        expiresAt: new Date(Date.now() + OTP_TTL_MS)
    });
    try {
        await sendOtpEmail(input.email, otp, input.purpose);
        return challengeId;
    } catch (error) {
        await SecurityChallengeModel.deleteOne({ challengeId }).catch(() => undefined);
        throw error;
    }
}

export async function consumeOtpChallenge(challengeId: unknown, purpose: ChallengePurpose, otp: unknown) {
    if (typeof challengeId !== 'string' || challengeId.length > 64 || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
        return { status: 'invalid' as const };
    }
    const query = {
        challengeId,
        purpose,
        expiresAt: { $gt: new Date() },
        attempts: { $lt: MAX_ATTEMPTS },
        consumedAt: { $exists: false }
    };
    const challenge = await SecurityChallengeModel.findOne(query).exec();
    if (!challenge) return { status: 'invalid' as const };

    const expected = Buffer.from(challenge.otpDigest, 'hex');
    const provided = Buffer.from(digestOtp(challengeId, purpose, otp), 'hex');
    const matches = expected.length === provided.length && timingSafeEqual(expected, provided);
    if (!matches) {
        await SecurityChallengeModel.updateOne(query, { $inc: { attempts: 1 } }).exec();
        return { status: 'invalid' as const };
    }

    const consumed = await SecurityChallengeModel.findOneAndUpdate(
        { ...query, otpDigest: challenge.otpDigest },
        { $set: { consumedAt: new Date() } },
        { new: true }
    ).exec();
    return consumed ? { status: 'ok' as const, challenge: consumed } : { status: 'invalid' as const };
}
