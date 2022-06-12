#!/usr/bin/env node
import arg from 'arg';
import pm2 from 'pm2';
import path from 'path';

import { __dirname } from './constants.js';
import initializeConfigurationFile from './commands/initialize-configuration-file.command.js';

const daemonProcessName = 'automated-database-backup';

interface Options {
  init: boolean;
  start: boolean;
  stop: boolean;
}

function parseArgumentsIntoOptions(rawArgs): Options {
  const args = arg({
    '--init': Boolean,
    '--start': Boolean,
    '--stop': Boolean
  }, {
    argv: rawArgs.slice(2)
  });

  return {
    init: args['--init'] || false,
    start: args['--start'] || false,
    stop: args['--stop'] || false
  }
}

function startAutomatedBackupOnDaemonProcess() {
  pm2.connect(function (err) {
    if (err) {
      console.error(err);
      process.exit(2);
    }

    pm2.start({
      script: path.resolve(__dirname, 'commands/run-automated-backup.command.js'),
      name: daemonProcessName
    }, function (err) {
      if (err) {
        console.error(err)
        return pm2.disconnect()
      }

      // exit from main script execution, leave the rest to process manager
      process.exit(2);
    });
  })
}

function stopAutomatedBackupDaemonProcess() {
  pm2.stop(daemonProcessName, function (err) {
    if (err) {
      console.log(err);
    }

    process.exit(0);
  });
}

(async () => {
  const options = parseArgumentsIntoOptions(process.argv);

  switch (true) {
    case options.init: await initializeConfigurationFile(); break;
    case options.start: startAutomatedBackupOnDaemonProcess(); break;
    case options.stop: stopAutomatedBackupDaemonProcess(); break;
    default: break;
  }
})();
