import { useAzureMonitor } from '@azure/monitor-opentelemetry';

// Initialize Application Insights early (only if connection string exists)
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  useAzureMonitor();
} else {
  console.warn("Skipping Azure Monitor initialization: APPLICATIONINSIGHTS_CONNECTION_STRING is missing.");
}

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import documentRoutes from './routes/document.routes';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('ClinicWorks API is running');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'clinicworks-api' });
});

app.use('/api', documentRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ status: 'error', message: 'Internal Server Error' });
});

app.listen(port, () => {
  console.log(`ClinicWorks API running on http://localhost:${port}`);
});
