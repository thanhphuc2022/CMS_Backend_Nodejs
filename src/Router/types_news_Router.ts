import express from "express"
import { Types_News } from "../Controller/Types_News"
import { middleware } from "../middleware/jwt";
const types_Router = express();

types_Router.post('/createtypes', middleware, Types_News.createTypes_News);

types_Router.post('/updatetypes/:id', middleware, Types_News.updateTypes_News);

types_Router.post('/deletetypes/:id', middleware, Types_News.deleteType_News);

types_Router.get('/loadtype', Types_News.loadTypes_News);

types_Router.get('/alltype', Types_News.loadAllType_News);

types_Router.get('/sort/:id', Types_News.sort);

export default types_Router;