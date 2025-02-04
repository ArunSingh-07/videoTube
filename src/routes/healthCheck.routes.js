import { Router } from "express";
import { healthCheck } from "../controllers/healthCheck.controllers.js";

const router = Router();

router.route("/").get(
  // upload.single("avatar"),
  healthCheck
);

router.route("/test").get(healthCheck);

export default router;
