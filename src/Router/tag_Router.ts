import express from "express";
import { middleware } from "../middleware/jwt";
import { Tag } from "../Controller/Tag";

const tag_Router = express();

tag_Router.post('/createtag', middleware, Tag.createTag);

tag_Router.post('/deletetag', middleware, Tag.deleteTag);

tag_Router.get('/alltag', Tag.loadAllTag);

export default tag_Router