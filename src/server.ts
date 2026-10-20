import express, { Request, Response } from "express";
import mongoose from "mongoose";
import { CONFIG } from "./config/config";
import token_Router from "./Router/token_Router";
import Account_Router from "./Router/Account_Router";
import Authentication_Router from "./Router/Authentication_Router";
import post_Router from "./Router/post_Router";
import news_Router from "./Router/news_Router";
import types_Router from "./Router/types_news_Router";
import categories_Router from "./Router/categories_Router";
import tag_Router from "./Router/tag_Router";
import About_index_Router from "./Display/Display_Router/About_index_Router";
import About_Images_Router from "./Display/Display_Router/About_images_Router";
import Images_logo_Router from "./Display/Display_Router/Images_logo_Router";
import About_Router from "./Display/Display_Router/About_Router";
import Content_Banner_Router from "./Display/Display_Router/Content_Banner_Router";
import Contact_Router from "./Display/Display_Router/Contact_Router";
import bodyParser from "body-parser";
import path from "path";
import { v2 as cloudinary } from 'cloudinary';
import { sanitizeRichHtml } from './Security/html';
import { wrapAsyncRoutes } from './middleware/asyncRoutes';

const date = new Date();

//npm start
//HIEN GIO KHI BUILD
const formatted = date.toTimeString();
//ket noi csdl mongoDB
mongoose
    .connect(CONFIG.mongo.url)
    .then(() => {
        console.log('Connect to MongoDB');
    })
    .catch((error) => {
        console.log(error);
    });

var app = express();
app.locals.sanitizeRichHtml = sanitizeRichHtml;

[token_Router, Account_Router, Authentication_Router, post_Router, news_Router, types_Router,
    categories_Router, tag_Router, About_index_Router, About_Images_Router, Images_logo_Router,
    About_Router, Content_Banner_Router, Contact_Router].forEach(wrapAsyncRoutes);

app.use(express.urlencoded({ extended: true, limit: '1mb', parameterLimit: 100 }));
app.use(bodyParser.urlencoded({ extended: false, limit: '1mb', parameterLimit: 100 }));
app.use(bodyParser.json({ limit: '1mb' }));

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})
// Sử dụng cookie-parser middleware

// app.use(cookieParser());
// // Xét session
// app.use(
//     session({
//         secret: 'this-is-a-long-and-complex-secret-key',
//         resave: false,
//         saveUninitialized: true,
//     })
// );

// Add headers before the routes are defined
app.use(function (req, res, next) {
    const allowedOrigins = new Set(['http://localhost:3000', 'https://tinhocnhuy.com']);
    const origin = req.headers.origin;
    res.vary('Origin');
    if (origin && allowedOrigins.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
});


app.get('/', function (req: Request, res: Response) {
    res.json("Backend CMS")
})

//token
app.use('/api', token_Router);
//Account
app.use('/api', Account_Router);
//auth
app.use('/api', Authentication_Router);
//post
app.use('/api', post_Router);
//news
app.use('/api', news_Router);
//categories
app.use('/api', categories_Router);
//types_news
app.use('/api', types_Router);
//tag
app.use('/api', tag_Router);

//Display
//about_Index
app.use('/api', About_index_Router);
//about_Images
app.use('/api', About_Images_Router);
//Image_Logo
app.use('/api', Images_logo_Router);
//About
app.use('/api', About_Router);
//Content_banner
app.use('/api', Content_Banner_Router);
//Contact_Router
app.use('/api', Contact_Router);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.static(path.join(__dirname, '../public')));
app.use((error: any, req: Request, res: Response, next: express.NextFunction) => {
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
    return res.status(status).json({ message: status >= 500 ? 'Lỗi máy chủ' : 'Yêu cầu không hợp lệ' });
});
// app.use(express.static('public'));

export default app;

if (require.main === module) {
    app.listen(CONFIG.Server.port, () => {
        console.log(`Example app listening at http://localhost:${CONFIG.Server.port} (${formatted})`)
    });
}
