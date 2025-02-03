import { Router } from "express";
import { healthCheck } from "../controllers/healthCheckController.js";

const router = Router();

router.route("/").get(healthCheck);

router.route("/test").get(healthCheck);

export default router;
