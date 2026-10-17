import express from "express";
import { middleware } from "../../middleware/jwt";
import {authorize} from "../../middleware/authorize";
import { midlleware_file, validateImageContent } from "../../middleware/file";
import { Content_Banner } from "../Display_Controller/Content_Banner";
import { rateLimit } from '../../Security/rateLimit';

const Content_Banner_Router=express();

Content_Banner_Router.post('/createcontentbanner', middleware, authorize, rateLimit('upload', 60, 60 * 60_000), midlleware_file, validateImageContent, Content_Banner.createContentBanner);

Content_Banner_Router.post('/updatecontentbanner/:id', middleware, authorize, rateLimit('upload', 60, 60 * 60_000), midlleware_file, validateImageContent, Content_Banner.updateContentBanner);

Content_Banner_Router.post('/deletecontentbanner/:id', middleware, authorize, rateLimit('upload', 60, 60 * 60_000), midlleware_file, Content_Banner.deleteContent_Banner);

Content_Banner_Router.get('/allcontentbanner', Content_Banner.allContent_Banner);

export default Content_Banner_Router
