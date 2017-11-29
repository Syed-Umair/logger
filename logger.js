/**
 * Logger Module
 * Each logger object automatically detects the process type,
 * creates seperate log based on its process type.
 */
let winston = require('winston');
let bugsnag = require("bugsnag");
let {
  shell
} = require('electron');
let fs = require('fs-extra');
let util = require('util');
let path = require('path');
let jsZip = require('jszip');
let appRootDirectory = require('app-root-dir');
let EventEmitter = require('events');
let emitter = new EventEmitter();
let settings;


/**
 * Creating logger session settings in global
 */
if (process.type === 'browser') {
  global.loggerSettings = {
    FILE_LOGGING: true,
    SESSION: createNewSession(),
    LOGS_EXPIRY: 7,
    ENABLE_BUGSNAG: false
  }
}

emitter.on('updateSettings', function(setting) {
  switch (setting.name) {
    case 'updateLogging':
      settings.FILE_LOGGING = setting.value;
      break;
    case 'updateLogExpiry':
      settings.LOGS_EXPIRY = setting.value;
      break;
    case 'updateBugsnag':
      settings.ENABLE_BUGSNAG = setting.value;
      break;
  }
});

/**
 * Returns loggerSettings
 * @return {object}
 */
function getSettings() {
  if (settings)
    return settings;

  if (process.type === 'browser') {
    return global.loggerSettings;
  } else {
    let {
      remote
    } = require('electron');
    return remote.getGlobal('loggerSettings');
  }
}

settings = getSettings();

const APP_NAME = getAppName() || 'electron-app';
const LOGSDIR = path.join(getAppDataLoc(), `${APP_NAME}-logs`);
const CUSTOMLEVELS = {
  levels: {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  },
  colors: {
    debug: 'blue',
    info: 'green',
    warn: 'yellow',
    error: 'red'
  }
};

/**
 * Setting up configuration for winston file transport and returns config object
 * @param  {process type}
 * @param  {Boolean}
 * @param  {string}
 * @return {object}
 */
function getConfig(type, isWebview, fileName) {
  let filename = null;
  let config = {
    name: 'fileTransport',
    prettyPrint: true,
    levels: CUSTOMLEVELS.levels,
    json: false,
    colorize: true,
    filename: null,
    timestamp: function () {
      let now = new Date();
      return `${now.toLocaleString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })}.${now.getMilliseconds()}`;
    },
    formatter: function (options) {
      return `${options.timestamp()}::${options.level}::${options.message}`;
    }
  };
  switch (type) {
    case 'renderer':
      if (isWebview) {
        filename = `webview.log`;
      } else {
        filename = `renderer.log`;
      }
      break;
    case 'browser':
      filename = `main.log`;
      break;
    default:
      filename = `default.log`;
  }
  if (fileName) {
    filename = filename.replace(/^/, `${fileName}-`);
  }
  let sessionFolder = settings.SESSION;
  config.filename = path.join(LOGSDIR, sessionFolder, filename);
  return config;
}

/**
 * appdata location based on platform
 * @return {string}
 */
function getAppDataLoc() {
  if (/^win/.test(process.platform))
    return path.join(process.env.USERPROFILE, 'AppData', 'local');
  else
    return path.join(process.env.HOME, 'Library', 'Application Support');
}

/**
 * returns the application name from the parent package.json
 * @return {string}
 */
function getAppName() {
  try {
    let manifest = require(`${path.join(appRootDirectory.get(), 'package.json')}`);
    if (manifest) {
      return manifest.name;
    }
  } catch (e) {
    console.error(e);
  }
}

/**
 * creates and persists latest session in electron-store
 */
function createNewSession() {
  let date = new Date();
  let timestamp = `${date.toLocaleString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })}`;
  timestamp = timestamp.replace(/\/|:/g, '-')
    .replace(/, /g, '_')
    .concat(`.${date.getMilliseconds()}`);
  return timestamp;
}

/**
 * Log expiry time in milliseconds
 * @return {ms}
 */
function getLogExpiry() {
  return new Date().getTime() - 24 * 60 * 60 * 1000 * settings.LOGS_EXPIRY;
}

/**
 * Converts input content to String using util.inspect
 * @param  {array}
 * @return {string}
 */
function getMessage(content) {
  let data = '';
  for (let value of content) {
    data += util.inspect(value) + '\n\t';
  }
  return data;
}

/**
 * Finds all log files in the @LOGSDIR and returns log files array
 * @return {array}
 */
async function getContents(path) {
  try {
    let contents = await fs.readdir(path);
    return contents.filter(function (file) {
      return !((/^\./.test(file)) || (/.zip$/.test(file)))
    });
  } catch (e) {
    console.error(e);
  }
}

/**
 * Finds file creation time and returns file creation time in ms
 * @param  {file}
 * @return {ms}
 */
async function getLogCreationTime(file) {
  try {
    let stat = await fs.stat(path.join(LOGSDIR, file));
    return stat.birthtime.getTime();
  } catch (e) {
    console.error(e);
  }
}

/**
 * Archives recent logs and returns zip path
 * @return {string}
 */
async function getRecentLogs() {
  try {
    let zip = new jsZip();
    let zipName = `logs-${Date.now()}.zip`;
    let sessions = await getContents(LOGSDIR);
    for (let session of sessions) {
      if ((await getLogCreationTime(session)) >= getLogExpiry()) {
        let logs = await getContents(path.join(LOGSDIR, session));
        for (let log of logs) {
          zip.file(`${session}/${log}`,
            await fs.readFile(path.join(LOGSDIR, session, log)));
        }
      }
    }
    return new Promise(resolve => {
      zip
        .generateNodeStream({
          type: 'nodebuffer',
          streamFiles: true,
          compression: 'DEFLATE'
        })
        .pipe(fs.createWriteStream(path.join(LOGSDIR, zipName)))
        .on('finish', () => {
          resolve(path.join(LOGSDIR, zipName));
        });
    });
  } catch (e) {
    console.error(e);
  }
}

/**
 * Deletes logs Older than @LOGS_EXPIRY
 * @return {promise}
 */
async function pruneOldLogs() {
  try {
    let sessions = await getContents(LOGSDIR);
    for (let session of sessions) {
      if ((await getLogCreationTime(session)) < getLogExpiry()) {
        await fs.remove(path.join(LOGSDIR, session));
      }
    }
    return `Logs older than ${settings.LOGS_EXPIRY} day(s) Cleared`;
  } catch (e) {
    console.error(e);
  }
}

/**
 * Logs the content
 * @param {object} context
 * @param {string} content
 * @param {string} level
 */
function logIt(context, content, level) {
  try {
    if (settings.FILE_LOGGING) {
      if (!fs.existsSync(LOGSDIR)) {
        fs.mkdirSync(LOGSDIR);
      }
      if (!fs.existsSync(path.join(LOGSDIR, settings.SESSION))) {
        fs.mkdirSync(path.join(LOGSDIR, settings.SESSION));
      }
      context.logAPI[level](getMessage(content));
    }
  } catch (e) {
    console.error(e);
  }
}
/**
 * Gives the domain
 * @param {string} url
 */
function parseDomain(url) {
  let domain = url.match(/\/\/(.+?)\//) ?
    url.match(/\/\/(.+?)\//).pop() :
    url.match(/\/\/(.+)/) ?
    url.match(/\/\/(.+)/).pop() :
    url;
  return domain;
}

class Logger {

  constructor({
    fileName = '',
    bugsnagKey = null,
    isWebview = false,
    type = process.type
  }) {
    pruneOldLogs();
    if (fileName) {
      fileName = parseDomain(fileName);
    }
    this.logAPI = new winston.Logger({
      level: 'error',
      exitOnError: false,
      levels: CUSTOMLEVELS.levels,
      transports: [
        new winston.transports.File(
          getConfig(type, isWebview, fileName)
        )
      ]
    });
    this.isWebview = isWebview;
    if (bugsnagKey) {
      settings.ENABLE_BUGSNAG = true;
      try {
          bugsnag.register(bugsnagKey, {
          autoNotify: false
        });
      } catch(e){
        console.error(e);
      }
    }
    winston.addColors(CUSTOMLEVELS.colors);
  }
  debug(...content) {
    logIt(this, content, 'debug');
  }
  log(...content) {
    logIt(this, content, 'info');
  }
  info(...content) {
    logIt(this, content, 'info');
  }
  warn(...content) {
    logIt(this, content, 'warn');
  }
  error(...content) {
    logIt(this, content, 'error');
    if (!this.isWebview && settings.ENABLE_BUGSNAG) {
      bugsnag.notify(new Error(content));
    }
  }
  pruneOldLogs() {
    return pruneOldLogs();
  }
  getLogArchive() {
    return getRecentLogs()
  }
  clearLogArchive(path) {
    return fs.remove(path);
  }
  openLogsDirectory() {
    shell.openItem(LOGSDIR);
  }
  getLogsDirectory() {
    return LOGSDIR;
  }
  enableLogging() {
    settings.FILE_LOGGING = true;
    emitter.emit('updateSettings', {
      name: 'updateLogging',
      value: true
    });
    return 'Logging Enabled';
  }
  disableLogging() {
    settings.FILE_LOGGING = false;
    emitter.emit('updateSettings', {
      name: 'updateLogging',
      value: false
    });
    return 'Logging Disabled';
  }
  setLogExpiry(logExpiry) {
    logExpiry = parseInt(logExpiry);
    if (logExpiry > 0 && logExpiry <= 30){
      settings.LOGS_EXPIRY = logExpiry;
      emitter.emit('updateSettings', {
        name: 'updateLogExpiry',
        value: logExpiry
      });
      return `Logs Expiry set to ${logExpiry}`;
    }
  }
  disableBugsnag(){
    settings.ENABLE_BUGSNAG = false;
    emitter.emit('updateSettings', {
      name: 'updateBugsnag',
      value: false
    });
  }
  enableBugsnag(){
    settings.ENABLE_BUGSNAG = true;
    emitter.emit('updateSettings', {
      name: 'updateBugsnag',
      value: true
    });
  }
}
module.exports = Logger;