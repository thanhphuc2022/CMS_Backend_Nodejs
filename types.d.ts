//Lưu username vào UserId
declare namespace Express {
    export interface Request {
        userId: string;
    }
}

//Upload file
declare global {
    namespace Express {
        export interface Request {
            uploadedFilePath: string;
        }
    }
}