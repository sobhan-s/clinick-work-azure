import { Request, Response, NextFunction } from "express";
import { DocumentService } from "../services/document.service";
import multer from "multer";

export async function uploadDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({
        status: "error",
        message: "A PDF file is required. Send it as multipart/form-data with the field name 'file'.",
      });
      return;
    }

    const processedBy =
      (typeof req.body?.processed_by === "string" && req.body.processed_by.trim())
        ? req.body.processed_by.trim()
        : (typeof req.body?.processedBy === "string" && req.body.processedBy.trim())
          ? req.body.processedBy.trim()
          : "System";

    const { document, result } = await DocumentService.processDocument(
      req.file.originalname,
      req.file.buffer,
      processedBy
    );

    res.status(201).json({
      status: "success",
      document,
      processing_result: result
    });
  } catch (error) {
    if (error instanceof multer.MulterError) {
      res.status(400).json({
        status: "error",
        message: error.message,
      });
      return;
    }

    if (error instanceof Error && error.message === "Only PDF files are accepted") {
      res.status(400).json({
        status: "error",
        message: error.message,
      });
      return;
    }

    console.error("Upload document error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to upload document",
    });
  }
}

export async function getAllDocuments(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const documents = await DocumentService.getAllDocuments();

    res.status(200).json({
      status: "success",
      documents,
    });
  } catch (error) {
    console.error("Get documents error:", error);

    res.status(500).json({
      status: "error",
      message: "Failed to retrieve documents",
    });
  }
}

export async function retryDocument(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const id = req.params.id as string;
    const document = await DocumentService.retryDocument(id);

    res.status(200).json({
      status: "success",
      message: "Document queued for retry",
      document,
    });
  } catch (error) {
    console.error("Retry document error:", error);

    if (error instanceof Error) {
      res.status(400).json({
        status: "error",
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      status: "error",
      message: "Failed to retry document",
    });
  }
}
