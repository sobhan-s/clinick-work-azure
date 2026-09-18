import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { db } from '../utils/db';

async function wipeDB() {
  try {
    console.log('Clearing database...');
    await db.query('TRUNCATE TABLE documents CASCADE;');
    console.log('All data deleted successfully!');
  } catch (error) {
    console.error('Failed to clear database:', error);
  } finally {
    process.exit(0);
  }
}

// wipeDB();
