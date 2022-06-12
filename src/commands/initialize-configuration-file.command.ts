import { execaCommand } from 'execa';
import path from 'path';
import { __dirname, configOSDirectory } from '../constants.js';

async function initializeConfigurationFile() {
  const configExampleSource = path.resolve(__dirname, '../../example.config.yaml');
  await execaCommand(`mkdir ${configOSDirectory}`);
  await execaCommand(`cp ${configExampleSource} ${configOSDirectory}/config.yaml`);
}

export default initializeConfigurationFile;
