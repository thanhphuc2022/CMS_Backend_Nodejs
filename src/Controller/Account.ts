import { Request, Response } from "express";
import AccountModel from "../Model/Account_Model";
import bcrypt from "bcrypt";
import { issueOtpChallenge, consumeOtpChallenge } from "../Security/otp";
import { OtpEmailDeliveryError } from "../Services/mailer";
import { randomUUID, randomBytes } from 'crypto';
import { generateAccessToken, generateRefreshToken } from "../middleware/jwt"

//ĐĂNG KÝ TÀI KHOẢN
async function get_Register(req: Request, res: Response) {
    try {
        const { username, fullname, email, password, repassword } = req.body;
        if ([username, fullname, email, password, repassword].some((value) => typeof value !== 'string')) {
            return res.status(400).json({ message: 'Thông tin đăng ký không hợp lệ' });
        }
        if (!/^[a-zA-Z0-9_.]{3,20}$/.test(username) || fullname.length < 1 || fullname.length > 200 ||
            !/^([a-z0-9_.-]+)@([\da-z.-]+)\.([a-z.]{2,20})$/i.test(email) || email.length > 254 ||
            password.length < 8 || password.length > 128 || password !== repassword) {
            return res.status(400).json({ message: 'Thông tin đăng ký không hợp lệ' });
        }
        const existing = await AccountModel.findOne({ $or: [{ username }, { email }] }).select('_id').lean();
        if (existing) return res.status(409).json({ message: 'Tên đăng nhập hoặc email đã được sử dụng' });
        const passwordHash = await bcrypt.hash(password, 10);
        const challengeId = await issueOtpChallenge({ purpose: 'registration', email, username, fullname, passwordHash });
        return res.json({ message: 'Vui lòng kiểm tra Email của bạn', challengeId });
    } catch (error) {
        if (error instanceof Error && error.message === 'OTP_RATE_LIMIT') {
            return res.status(429).json({ message: 'Vui lòng chờ trước khi yêu cầu mã OTP mới' });
        }
        console.error('Registration OTP request failed:', error instanceof OtpEmailDeliveryError ? error.code : 'REGISTRATION_WORKFLOW_ERROR');
        return res.status(503).json({ message: 'Không thể gửi mã xác nhận lúc này' });
    }
}

async function post_Register(req: Request, res: Response) {
    try {
        const result = await consumeOtpChallenge(req.body.challengeId, 'registration', req.body.otp);
        if (result.status !== 'ok') return res.status(400).json({ message: 'Mã xác nhận không hợp lệ hoặc đã hết hạn' });
        const { username, fullname, email, passwordHash } = result.challenge;
        if (!username || !fullname || !passwordHash) return res.status(400).json({ message: 'Thử thách không hợp lệ' });
        const existing = await AccountModel.findOne({ $or: [{ username }, { email }] }).select('_id').lean();
        if (existing) return res.status(409).json({ message: 'Tên đăng nhập hoặc email đã được sử dụng' });
        await AccountModel.create({ username, fullname, email, password: passwordHash });
        return res.json({ message: 'Đăng ký thành công' });
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

async function getLogin(res: Response) {
    res.send('login');
}

async function login(req: Request, res: Response) {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 100 || password.length > 128) {
        return res.status(400).json({ message: 'Thông tin đăng nhập không hợp lệ' });
    }
    try {
        const user = await AccountModel.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không đúng' });
        }
        const accesstoken = generateAccessToken(username);
        const refreshtoken = generateRefreshToken(username);
        await AccountModel.findOneAndUpdate({ _id: user._id }, { $set: { refreshtoken } });
        return res.json({ message: 'Đăng nhập thành công', accesstoken, refreshtoken });
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

async function get_ForgotPassword(req: Request, res: Response) {
    const email = req.body.email;
    if (typeof email !== 'string' || email.length > 254 || !/^([a-z0-9_.-]+)@([\da-z.-]+)\.([a-z.]{2,20})$/i.test(email)) {
        return res.status(400).json({ message: 'Email không hợp lệ' });
    }
    try {
        const account = await AccountModel.findOne({ email }).select('_id').lean();
        const challengeId = account
            ? await issueOtpChallenge({ purpose: 'password-reset', email, accountId: String(account._id) })
            : randomUUID();
        return res.json({ message: 'Vui lòng kiểm tra email của bạn', challengeId });
    } catch (error) {
        if (error instanceof Error && error.message === 'OTP_RATE_LIMIT') {
            return res.status(429).json({ message: 'Vui lòng chờ trước khi yêu cầu mã OTP mới' });
        }
        return res.status(503).json({ message: 'Không thể gửi mã xác nhận lúc này' });
    }
}

async function post_ForgotPassword(req: Request, res: Response) {
    try {
        const result = await consumeOtpChallenge(req.body.challengeId, 'password-reset', req.body.otp);
        if (result.status !== 'ok' || !result.challenge.accountId) {
            return res.status(400).json({ message: 'Mã xác nhận không hợp lệ hoặc đã hết hạn' });
        }
        const newPassword = randomBytes(18).toString('base64url');
        const passwordHash = await bcrypt.hash(newPassword, 10);
        const account = await AccountModel.findOneAndUpdate(
            { _id: result.challenge.accountId },
            { $set: { password: passwordHash }, $unset: { refreshtoken: 1 } },
            { new: true }
        ).select('_id');
        if (!account) return res.status(400).json({ message: 'Yêu cầu đặt lại không còn hợp lệ' });
        return res.json({ message: 'Mật khẩu mới của bạn là ' + newPassword });
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}
async function changePassword(req: Request, res: Response) {
    const password = req.body.password;
    const newpassword = req.body.newpassword;
    const renewpassword = req.body.renewpassword;

    try {
    if ([password, newpassword, renewpassword].some((value) => typeof value !== 'string' || value.length === 0) || newpassword.length < 8) {
        return res.status(400).json({ message: "Thông tin mật khẩu không hợp lệ" });
    }
    if (newpassword !== renewpassword) {
        return res.status(400).json({ message: "Mật khẩu mới không khớp" });
    }
    const findPass = await AccountModel.findOne({ username: req.userId });
    if (!findPass) return res.status(401).json({ message: 'Tài khoản không hợp lệ' });
    const isMatch = await bcrypt.compare(password, findPass.password);
    if (!isMatch) return res.status(401).json({ message: "Mật khẩu không đúng" });
        //mã hóa mật khẩu
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(renewpassword, salt);
        await AccountModel.findOneAndUpdate({ username: req.userId }, {
            password: hashedPassword,
            $unset: { refreshtoken: 1 }
        })
        return res.json({ message: "Đổi mật khẩu thành công" })
    } catch {
        return res.status(500).json({ message: 'Lỗi máy chủ' });
    }
}

//CẬP NHẬT TÀI KHOẢN
async function putAccount(req: Request, res: Response) {
    const fullname = req.body.fullname;
    const email = req.body.email;
    const emailRegex = /^([a-z0-9_\.-]+)@([\da-z\.-]+)\.([a-z\.]{2,6})$/;
    if (typeof fullname !== 'string' || typeof email !== 'string' || !fullname || !email || fullname.length > 200 || email.length > 254) {
        return res.status(400).json({ message: "Vui lòng điền đầy đủ thông tin" });
    }
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Email không hợp lệ" });
    } else {
        await AccountModel.findOneAndUpdate({ username: req.userId }, {
            fullname: fullname,
            email: email
        })
        res.json({ message: "Cập nhật thành công" });
    }
}

//ĐĂNG XUẤT TÀI KHOẢN
// async function logout(req:Request, res:Response) {
//     try {
//         const refreshToken=req.headers.authorization?.split(" ")[1];

//         // Kiểm tra xem refreshToken có tồn tại hay không
//         if (!refreshToken) {
//             return res.status(400).json({ message: "Không tìm thấy refresh token" });
//         }

//         // Hủy bỏ refreshToken bằng cách xóa nó khỏi cơ sở dữ liệu
//         await AccountModel.findOneAndUpdate(
//             { refreshToken: refreshToken },
//             { $unset: { refreshToken: "" } }
//         );

//         res.status(200).json({ message: "Đăng xuất thành công" });
//     } catch (error) {
//         console.error("Lỗi trong quá trình đăng xuất:", error);
//         res.status(500).json({ message: "Lỗi trong quá trình đăng xuất" });
//     }
// }

async function getUploadDemo(req: Request, res: Response) {
    res.render('demo.ejs')
}

export const Account = {
    get_Register,
    getLogin,
    login,
    post_Register,
    get_ForgotPassword,
    post_ForgotPassword,
    changePassword,
    putAccount,
    // logout
    // getUploadDemo,
};
