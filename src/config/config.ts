import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

//TÀI KHOẢN MONGODB
const MONGO_USERNAME = process.env.MONGO_USERNAME || '';
const MONGO_PASSWORD = process.env.MONGO_PASSWORD || '';
const MONGO_URL = `mongodb+srv://${MONGO_USERNAME}:${MONGO_PASSWORD}@demonodejs.r29hvtz.mongodb.net/Blog?retryWrites=true&w=majority`;

const SERVER_PORT = process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 1337;

//JWT TOKEN
const ACCESS = process.env.JWT_SECRET_ACCESS || '';
const REFRESH = process.env.JWT_SECRET_REFRESH || '';

//EMAIL API
const EMAIL_API=process.env.EMAIL_API;

//API CLOUDINARY
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

//API GOOGLE TẢI LÊN HÌNH ẢNH THÔNG QUA TOKEN GOOGLE CUNG CẤP
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

//ID FOLDER LƯU HÌNH ẢNH CỦA THNY
const FOLDER_ID = process.env.GOOGLE_API_FODELID;

export const CONFIG = {
    //link database 
    mongo: {
        url: MONGO_URL
    },
    //cổng server
    Server: {
        port: SERVER_PORT
    },

    jwt: {
        access: ACCESS,
        refresh: REFRESH
    },
    cloudinary: {
        cloud_name: CLOUD_NAME,
        api_key: API_KEY,
        api_secret: API_SECRET
    },
    google_drive: {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        refresh_token: REFRESH_TOKEN,
        folderid: FOLDER_ID
    },
EMAIL_API
};
