import { Router } from "express";
import { uploadMiddleware } from "../middlewares/upload.middleware";
import {
  uploadDocument,
  getAllDocuments,
  retryDocument,
} from "../controllers/document.controller";

const router = Router();

router.post("/upload", uploadMiddleware.single("file"), uploadDocument);
router.get("/documents", getAllDocuments);
router.post("/documents/:id/retry", retryDocument);

export default router;
