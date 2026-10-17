import express from "express";
import { middleware } from "../../middleware/jwt"
import {authorize} from "../../middleware/authorize";
import { midlleware_file, validateImageContent } from "../../middleware/file";
import { Images_logo_Index } from "../Display_Controller/Images_logo";
import { rateLimit } from '../../Security/rateLimit';

const Images_logo_Router = express();

Images_logo_Router.post('/createimagelogo', middleware, authorize, rateLimit('upload', 60, 60 * 60_000), midlleware_file, validateImageContent, Images_logo_Index.createImageLogo);

Images_logo_Router.post('/deleteimagelogo/:id', middleware, authorize, rateLimit('upload', 60, 60 * 60_000), midlleware_file, Images_logo_Index.deleteImageLogo);

Images_logo_Router.get('/allimagelogo', Images_logo_Index.allImagaLogo);

export default Images_logo_Router;
