import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const configOSDirectory = path.resolve(os.homedir(), './.database-autobackup');

export {
  __dirname,
  configOSDirectory
};
