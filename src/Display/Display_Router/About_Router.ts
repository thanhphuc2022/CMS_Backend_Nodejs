import express from "express";
import { middleware } from "../../middleware/jwt";
import {authorize} from "../../middleware/authorize";
// import { About } from "../../Controller/Display/About";
import { About } from "../Display_Controller/About";
import { midlleware_file, validateImageContent } from "../../middleware/file";
import { rateLimit } from '../../Security/rateLimit';

const About_Router = express();

About_Router.post('/createabout', middleware, authorize, rateLimit('upload', 60, 60 * 60_000), midlleware_file, validateImageContent, About.createAbout);

About_Router.post('/updateabout/:id', middleware, authorize, rateLimit('upload', 60, 60 * 60_000), midlleware_file, validateImageContent, About.updateAbout);

About_Router.post('/deleteabout/:id', middleware, authorize, rateLimit('upload', 60, 60 * 60_000), midlleware_file, About.deleteAbout);

About_Router.get('/allabout', About.allAbout)

export default About_Router
