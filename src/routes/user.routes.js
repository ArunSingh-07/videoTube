import { Router } from "express";
import { upload } from "../middlewares/multer.middleware.js";
import { registerUser, logoutUser } from "../controllers/user.controllers.js";
import { veriftJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  registerUser
);

//secured routes

router.route("/logout").post(veriftJWT, logoutUser);

export default router;
