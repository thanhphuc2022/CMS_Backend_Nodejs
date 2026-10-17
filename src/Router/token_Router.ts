import express from "express";
import { checkToken } from "../middleware/jwt"

const token_Router = express();

token_Router.post('/checktoken', checkToken)

export default token_Router;