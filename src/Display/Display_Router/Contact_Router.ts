import express from "express";
import {middleware} from  "../../middleware/jwt"
import {authorize} from "../../middleware/authorize";
import { Contact } from "../Display_Controller/contact";

const Contact_Router=express();

Contact_Router.get('/getcontact', Contact.getContact)

Contact_Router.post('/createcontact', middleware, authorize, Contact.createContact);

Contact_Router.post('/updatecontact', middleware, authorize, Contact.updateContact);

export default Contact_Router   