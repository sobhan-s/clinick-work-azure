import axios from 'axios';
import type { ApiResponse, ProcessedDocument } from '../types';

const API_BASE_URL = 'https://app-clinicworks-backend-dev-fjf4bhe4c7avhzer.centralindia-01.azurewebsites.net/api';

const api = axios.create({ baseURL: API_BASE_URL });

export const documentService = {
  async getAllDocuments(): Promise<ProcessedDocument[]> {
    const response = await api.get<ApiResponse<ProcessedDocument>>('/documents');
    return response.data.documents || [];
  },

  async uploadDocument(file: File, processedBy: string = 'User'): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('processed_by', processedBy);
    const response = await api.post<ApiResponse<ProcessedDocument>>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async retryDocument(id: string): Promise<any> {
    const response = await api.post<ApiResponse<ProcessedDocument>>(`/documents/${id}/retry`);
    return response.data;
  },

  async deleteDocument(id: string): Promise<void> {
    await api.delete(`/documents/${id}`);
  },
};
