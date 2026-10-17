import { createHash } from 'crypto';
import { isIP } from 'net';
import { Request, Response, NextFunction } from 'express';
import { RateLimitModel } from '../Model/RateLimit_Model';

export function clientAddress(req: Request): string {
    if (process.env.VERCEL === '1') {
        const forwarded = req.get('x-forwarded-for');
        if (forwarded && isIP(forwarded.trim())) return forwarded.trim();
    }
    return req.socket.remoteAddress || 'unknown';
}

export async function takeRateLimit(key: string, maximum: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const digest = createHash('sha256').update(key).digest('hex');
    const bucketId = `${digest}:${windowStart}`;
    const bucket = await RateLimitModel.findOneAndUpdate(
        { _id: bucketId },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + windowMs + 60_000) } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    return Boolean(bucket && bucket.count <= maximum);
}

export function rateLimit(scope: string, maximum: number, windowMs: number) {
    return async function distributedRateLimit(req: Request, res: Response, next: NextFunction) {
        try {
            const allowed = await takeRateLimit(`${scope}:${clientAddress(req)}`, maximum, windowMs);
            if (!allowed) {
                res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
                return res.status(429).json({ message: 'Thao tác quá thường xuyên, vui lòng thử lại sau' });
            }
            return next();
        } catch {
            return res.status(503).json({ message: 'Dịch vụ tạm thời không khả dụng' });
        }
    };
}
