import jwt, { Secret, JwtPayload } from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { CONFIG } from '../config/config';
import AccountModel from '../Model/Account_Model';

const accessSecret = CONFIG.jwt.access;
const refreshSecret = CONFIG.jwt.refresh;
if (!accessSecret || !refreshSecret) {
    throw new Error('JWT_SECRET_ACCESS and JWT_SECRET_REFRESH must be configured');
}

//HAM TAO ACCESSTOKEN
export function generateAccessToken(user: any) {
    return jwt.sign({ user }, accessSecret, { expiresIn: '3h', algorithm: 'HS256' })
}
//HAM TAO REFRESHTOKEN
export function generateRefreshToken(user: any) {
    return jwt.sign({ user }, refreshSecret, { expiresIn: '365d', algorithm: 'HS256' })
}

//HAM KIEM TRA DANG NHAP
interface AuthTokenPayload {
    user: string;
    exp: number;
}

export const middleware = async function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader !== 'string' || !/^Bearer\s+\S+$/i.test(authHeader)) {
        return res.status(401).json({ message: "Vui lòng đăng nhập để tiếp tục" });
    }
    const token = authHeader.split(/\s+/)[1];
    try {
        const decodedToken = jwt.verify(token, accessSecret, { algorithms: ['HS256'] }) as AuthTokenPayload;
        if (!decodedToken || typeof decodedToken !== 'object' || typeof decodedToken.user !== 'string' || !decodedToken.user || typeof decodedToken.exp !== 'number') {
            return res.status(401).json({ message: 'Token không hợp lệ' });
        }
        const account = await AccountModel.findOne({ username: decodedToken.user }).select('_id').lean();
        if (!account) return res.status(401).json({ message: 'Token không hợp lệ' });
        req.userId = decodedToken.user;
        return next();
    } catch (error) {
        return res.status(401).json({ message: 'Token không hợp lệ' });
    }
}

export async function checkToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader !== 'string' || !/^Bearer\s+\S+$/i.test(authHeader)) return res.json(false);
    const token = authHeader.split(/\s+/)[1];

    if (token) {
        try {
            const decodedToken = jwt.verify(token, accessSecret, { algorithms: ['HS256'] }) as AuthTokenPayload;
            if (typeof decodedToken.user !== 'string' || typeof decodedToken.exp !== 'number') return res.json(false);
            const account = await AccountModel.findOne({ username: decodedToken.user }).select('_id').lean();
            if (!account) return res.json(false);
            req.userId = decodedToken.user;

            // Token hợp lệ, trả về true
            return res.json(true);
        } catch (err) {
            console.error("Error verifying token:", err); // Ghi log lỗi để kiểm tra
        }
    }

    // Token không hợp lệ hoặc không tồn tại, trả về false
    return res.json(false);
}

//Tìm refreshtoken trong csdl
function findRefreshToken(refreshToken: string): Promise<JwtPayload | null> {
    // Gọi hàm truy vấn trong cơ sở dữ liệu để tìm kiếm refreshtoken
    // và trả về một Promise chứa payload hoặc null
    return AccountModel.findOne({ refreshtoken: refreshToken }).exec();
}

export async function requestRefreshToken(req: Request, res: Response,) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader !== 'string' || !/^Bearer\s+\S+$/i.test(authHeader)) {
        return res.status(401).json({ message: 'Token không tồn tại.' });
    }
    const refreshToken = authHeader.split(/\s+/)[1];
    try {
        const decodedToken = jwt.verify(refreshToken, refreshSecret, { algorithms: ['HS256'] }) as { user: unknown };
        if (!decodedToken || typeof decodedToken.user !== 'string') {
            return res.status(401).json({ message: 'Invalid refresh token.' });
        }
        // const user = decodedToken.user;
        // Truy vấn refreshtoken trong cơ sở dữ liệu
        const refreshtokendoc = await findRefreshToken(refreshToken);
        // Kiểm tra xem refreshtoken có tồn tại trong cơ sở dữ liệu hay không
        if (!refreshtokendoc || typeof decodedToken.user !== 'string' || refreshtokendoc.username !== decodedToken.user) {
            return res.status(401).json({ message: 'Token không tồn tại.' });
        }
        // Tạo access token mới dựa trên thông tin người dùng từ refreshtoken
        const new_accessToken = generateAccessToken(decodedToken.user);
        return res.json({ accesstoken: new_accessToken });
    } catch (error) {
        return res.status(401).json({ message: 'Token không hợp lệ.' })
    }

}
