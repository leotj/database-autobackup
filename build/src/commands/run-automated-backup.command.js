import yaml from 'js-yaml';
import fs from 'fs';
import { execa, execaCommand } from 'execa';
import archiver from 'archiver';
import archiverZipEncrypted from 'archiver-zip-encrypted';
import { S3, PutObjectCommand } from '@aws-sdk/client-s3';
import cron from 'node-cron';
import { configOSDirectory } from '../constants.js';
function getConfig() {
    return yaml.load(fs.readFileSync(`${configOSDirectory}/config.yaml`, 'utf8'));
}
async function dumpDb(config) {
    const resultFileName = `dump-${config.dbName}-${Date.now()}.sql`;
    const mysqldump = `${config.dbClientProgramsDirectory}/mysqldump`;
    const userOptions = `--user=${config.dbUserName}`;
    const passwordOptions = `--password=${config.dbPassword}`;
    const databaseNameOptions = `${config.dbName}`;
    const resultFileOptions = `--result-file=${resultFileName}`;
    await execa(mysqldump, [userOptions, passwordOptions, databaseNameOptions, resultFileOptions]);
    return resultFileName;
}
function archiveDb(config, dumpedDb) {
    const output = fs.createWriteStream(process.cwd() + `/${dumpedDb}.zip`);
    archiver.registerFormat('zip-encrypted', archiverZipEncrypted);
    const archive = archiver.create('zip-encrypted', { zlib: { level: 9 }, encryptionMethod: 'aes256', password: config.encryptionPassphrase });
    archive.pipe(output);
    archive.file(dumpedDb, { name: dumpedDb });
    return archive.finalize();
}
async function cleanUp(dumpedDb) {
    await execaCommand(`rm ${dumpedDb} ${dumpedDb}.zip`);
}
function uploadToStorage(config, dumpedDb) {
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
async function backupDb(config) {
    try {
        const dumpedDb = await dumpDb(config);
        if (dumpedDb) {
            await archiveDb(config, dumpedDb);
            await uploadToStorage(config, dumpedDb);
            await cleanUp(dumpedDb);
        }
    }
    catch (err) {
        console.log(err);
    }
}
(async function runAutomatedBackupSchedule() {
    const config = getConfig();
    const scheduleOptions = {
        scheduled: true,
        timezone: config.cronOptionsTimeZone
    };
    const scheduledFunction = async () => {
        await backupDb(config);
    };
    const task = cron.schedule(config.cronExpression, scheduledFunction, scheduleOptions);
    task.start();
})();
