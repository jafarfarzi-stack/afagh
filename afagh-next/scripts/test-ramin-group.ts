import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgres://afagh:afagh@localhost:5432/afagh_db' });

// We can run the same logic as transcript-utils.ts groupTranscript
import { groupTranscript } from '../src/app/admin/students/transcript-utils.ts';
