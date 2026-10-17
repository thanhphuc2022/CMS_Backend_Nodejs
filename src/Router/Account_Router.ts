import express from "express";
import { Account } from "../Controller/Account";
import { upload } from "../uploadfile";
import { middleware, requestRefreshToken } from "../middleware/jwt"
import { contact, contact2 } from "../Services/mailer";
import { rateLimit } from '../Security/rateLimit';
const Account_Router = express();

Account_Router.post('/register', rateLimit('register', 5, 15 * 60_000), Account.get_Register);

Account_Router.post('/postregister', rateLimit('register-verify', 10, 15 * 60_000), Account.post_Register);

// Account_Router.get('/login', Account.getLogin);

Account_Router.post('/login', rateLimit('login', 20, 15 * 60_000), Account.login);

Account_Router.post('/forgotpass', rateLimit('otp-send', 3, 15 * 60_000), Account.get_ForgotPassword);

Account_Router.post('/forgotpassword', rateLimit('otp-verify', 10, 15 * 60_000), Account.post_ForgotPassword);

Account_Router.post('/changePass', middleware, Account.changePassword);

Account_Router.post('/putAccount', middleware, Account.putAccount);

Account_Router.post('/contact', rateLimit('contact', 5, 15 * 60_000), contact2);

// auth_Router.post('/logout', auth.logout);

Account_Router.post('/refreshtoken', requestRefreshToken);

Account_Router.get('/upload', upload.get_Uploadfile);

Account_Router.post('/upload', middleware, rateLimit('upload', 30, 60 * 60_000), upload.post_Uploadfile);

export default Account_Router;
