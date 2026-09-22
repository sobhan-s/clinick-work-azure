import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import dotenv from 'dotenv';
dotenv.config();

const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'documents';
const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;

let blobServiceClient: BlobServiceClient;

if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
  // Use connection string (e.g. for local Azurite or explicitly provided connection)
  blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
} else if (accountName) {
  // Use Managed Identity / DefaultAzureCredential
  blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    new DefaultAzureCredential()
  );
} else {
  // Default fallback for Azurite local development
  blobServiceClient = BlobServiceClient.fromConnectionString('UseDevelopmentStorage=true');
}

export const containerClient = blobServiceClient.getContainerClient(containerName);

export async function downloadBlobToBuffer(blobName: string): Promise<Buffer> {
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  return await blockBlobClient.downloadToBuffer();
}
