import express from "express";
import { middleware } from "../../middleware/jwt"
import {authorize} from "../../middleware/authorize";
import { midlleware_file, validateImageContent } from "../../middleware/file";
import { About_Images } from "../Display_Controller/About_images";
import { rateLimit } from '../../Security/rateLimit';

const About_Images_Router= express();

About_Images_Router.post('/createaboutimage', middleware, authorize, rateLimit('upload', 60, 60 * 60_000), midlleware_file, validateImageContent, About_Images.createAboutImages);

About_Images_Router.post('/deleteaboutiamge/:id', middleware, authorize, rateLimit('upload', 60, 60 * 60_000), midlleware_file, About_Images.deleteAboutImages);

About_Images_Router.get('/allaboutimage', About_Images.allAboutImages);

export default About_Images_Router
