import 'dotenv/config';
import { execa, execaCommand } from 'execa';
import archiver from 'archiver';
import archiverZipEncrypted from 'archiver-zip-encrypted';
import fs from 'fs';
import { S3, PutObjectCommand } from '@aws-sdk/client-s3';

async function dumpDb(): Promise<string | void> {
  const resultFileName = `dump-${process.env.DB_NAME}-${Date.now()}.sql`;

  const mysqldump = `${process.env.DB_CLIENT_PROGRAMS_DIR}/mysqldump`;
  const userOptions = `--user=${process.env.DB_USERNAME}`;
  const passwordOptions = `--password=${process.env.DB_PASSWORD}`;
  const databaseNameOptions = `${process.env.DB_NAME}`;
  const resultFileOptions = `--result-file=${resultFileName}`;

  await execa(mysqldump, [userOptions, passwordOptions, databaseNameOptions, resultFileOptions]);

  return resultFileName;
}

function archiveDb(dumpedDb: string) {
  const output = fs.createWriteStream(process.cwd() + `/${dumpedDb}.zip`);
  archiver.registerFormat('zip-encrypted', archiverZipEncrypted);
  const archive = archiver.create('zip-encrypted',
    { zlib: { level: 9 }, encryptionMethod: 'aes256', password: process.env.ENCRYPTION_PASSPHRASE }
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
    region: process.env.AWS_S3_REGION_NAME,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  const file = `${dumpedDb}.zip`;
  const fileStream = fs.createReadStream(file);
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: file,
    Body: fileStream,
    StorageClass: process.env.AWS_S3_STORAGE_CLASS
  });

  return client.send(command);
}

(async () => {
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
})();
