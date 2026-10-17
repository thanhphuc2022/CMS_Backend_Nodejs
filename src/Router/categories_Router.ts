import express from "express";
import { Categories } from "../Controller/Categories";
import { middleware } from "../middleware/jwt";
const categories_Router = express();

categories_Router.post('/createCategories', middleware, Categories.createCategories);

categories_Router.post('/updateCategories/:id', middleware, Categories.updateCategories);

categories_Router.post('/deleteCategories/:id', middleware, Categories.deleteCategories);

categories_Router.get('/loadCategories', Categories.loadCategories);

categories_Router.get('/loadAllCategories', Categories.loadAllCategories);

export default categories_Router;