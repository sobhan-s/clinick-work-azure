import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const accountName =
  process.env.AZURE_STORAGE_ACCOUNT_NAME || "stclinicworksdevcentrali"; 

const containerName =
  process.env.AZURE_STORAGE_CONTAINER_NAME || "pdf-documents";

const credential = new DefaultAzureCredential();

const blobServiceClient = new BlobServiceClient(
  `https://${accountName}.blob.core.windows.net`,
  credential
);

export const containerClient =
  blobServiceClient.getContainerClient(containerName);