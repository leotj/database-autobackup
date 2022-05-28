import 'dotenv/config';
import { execa, execaCommand } from 'execa';
import archiver from 'archiver';
import archiverZipEncrypted from 'archiver-zip-encrypted';
import fs from 'fs';
import { S3, PutObjectCommand } from '@aws-sdk/client-s3';
import cron from 'node-cron';
import yaml from 'js-yaml';

interface Config {
  dbClientProgramsDirectory: string;
  dbName: string;
  dbUserName: string;
  dbPassword: string;
  encryptionPassphrase: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsS3RegionName: string;
  awsS3BucketName: string;
  awsS3StorageClass: string;
  cronExpression: string;
  cronOptionsTimeZone: string;
}

const config: Config = yaml.load(fs.readFileSync('config.yaml', 'utf8'));

async function dumpDb(): Promise<string | void> {
  const resultFileName = `dump-${config.dbName}-${Date.now()}.sql`;

  const mysqldump = `${config.dbClientProgramsDirectory}/mysqldump`;
  const userOptions = `--user=${config.dbUserName}`;
  const passwordOptions = `--password=${config.dbPassword}`;
  const databaseNameOptions = `${config.dbName}`;
  const resultFileOptions = `--result-file=${resultFileName}`;

  await execa(mysqldump, [userOptions, passwordOptions, databaseNameOptions, resultFileOptions]);

  return resultFileName;
}

function archiveDb(dumpedDb: string) {
  const output = fs.createWriteStream(process.cwd() + `/${dumpedDb}.zip`);
  archiver.registerFormat('zip-encrypted', archiverZipEncrypted);
  const archive = archiver.create('zip-encrypted',
    { zlib: { level: 9 }, encryptionMethod: 'aes256', password: config.encryptionPassphrase }
  );
  archive.pipe(output);
  archive.file(dumpedDb, { name: dumpedDb });
  return archive.finalize();
}

async function cleanUp(dumpedDb: string) {
  await execaCommand(`rm ${dumpedDb} ${dumpedDb}.zip`);
}

function uploadToStorage(dumpedDb: string) {
  const client = new S3({
    region: config.awsS3RegionName,
    credentials: {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey
    }
  });

  const file = `${dumpedDb}.zip`;
  const fileStream = fs.createReadStream(file);
  const command = new PutObjectCommand({
    Bucket: config.awsS3BucketName,
    Key: file,
    Body: fileStream,
    StorageClass: config.awsS3StorageClass
  });

  return client.send(command);
}

async function backupDb() {
  try {
    const dumpedDb = await dumpDb();

    if (dumpedDb) {
      await archiveDb(dumpedDb);
      await uploadToStorage(dumpedDb);
      await cleanUp(dumpedDb);
    }
  } catch (err) {
    console.log(err)
  }
}

(async () => {
  const scheduleOptions = {
    scheduled: true,
    timezone: config.cronOptionsTimeZone
  };

  const task = cron.schedule(config.cronExpression, backupDb, scheduleOptions);

  task.start();
})();
