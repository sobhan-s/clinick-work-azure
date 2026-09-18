import { Router } from "express";
import { uploadMiddleware } from "../middlewares/upload.middleware";
import {
  uploadDocument,
  getAllDocuments,
  retryDocument,
  deleteDocument,
} from "../controllers/document.controller";

const router = Router();

router.post("/upload", uploadMiddleware.single("file"), uploadDocument);
router.get("/documents", getAllDocuments);
router.post("/documents/:id/retry", retryDocument);
router.delete("/documents/:id", deleteDocument);

export default router;
