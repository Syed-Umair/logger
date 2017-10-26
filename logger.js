/**
 * Logger Module
 * Each logger object automatically detects the process type, 
 * creates seperate log based on its process type.
 */
let winston = require('winston');
let {shell} = require('electron');
let fs = require('fs-extra');
let util = require('util');
let path = require('path');
let jsZip = require('jszip');
let appRootDirectory = require('app-root-dir');
let settings;


/**
 * Creating logger session 
 * Object.
 */
if (process.type === 'browser') {
  global.loggerSettings = {
    FILE_LOGGING: true,
    SESSION: createNewSession(),
    LOGS_EXPIRY: 7,
    ENABLE_BUGSNAG: false
  }
}


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

const LOGS_EXPIRY = settings.LOGS_EXPIRY;
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
function getConfig(type, isWebview, domain = 'webview', fileName) {
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
        filename = `${domain}.log`;
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
  let sessionFolder = settings.SESSION || '';
  if (!fs.existsSync(path.join(LOGSDIR, sessionFolder))) {
    fs.mkdirSync(path.join(LOGSDIR, sessionFolder));
  }
  config.filename = path.join(LOGSDIR, sessionFolder, filename);
  return config;
}

/**
 * appdata location based on platform
 * @return {string}
 */
function getAppDataLoc() {
  if (/^win/.test(process.platform))
    return process.env.LOCALAPPDATA;
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
  } catch (e) { }
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
  timestamp = timestamp.replace(/\/|:/g, '-').replace(/, /g, '_');
  return timestamp;
}

/**
 * Log expiry time in milliseconds
 * @return {ms}
 */
function getLogExpiry() {
  return new Date().getTime() - 24 * 60 * 60 * 1000 * LOGS_EXPIRY;
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
    console.log(e);
    return e;
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
    console.log(e);
    return e;
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
    console.log(e);
    return e;
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
    return `Logs older than ${LOGS_EXPIRY} day(s) Cleared`;
  } catch (e) {
    console.log(e);
    return e;
  }
}

/**
 * Logs the content
 * @param {object} context 
 * @param {string} content 
 * @param {string} level 
 */
function logIt(context, content, level) {
  if (settings.FILE_LOGGING)
    context.logAPI[level](getMessage(content));
}
/**
 * Gives the domain
 * @param {string} url 
 */
function parseDomain(url){
  let domain = url.match(/\/\/(.+?)\//) 
  ? url.match(/\/\/(.+?)\//).pop() 
  : url.match(/\/\/(.+)/) 
  ? url.match(/\/\/(.+)/).pop() 
  : url;
  return domain;
}

class Logger {
  
  constructor({
    fileName = '',
    bugsnagKey = null,
    isWebview = false,
    domain = null,
    type = process.type
    }) {
    if (!fs.existsSync(LOGSDIR)) {
      fs.mkdirSync(LOGSDIR);
    }
    pruneOldLogs();
    if (domain){
      domain = parseDomain(domain);
    }
    this.logAPI = new winston.Logger({
      level: 'error',
      exitOnError: false,
      levels: CUSTOMLEVELS.levels,
      transports: [
        new winston.transports.File(
          getConfig(type, isWebview, domain, fileName)
        )
      ]
    });
    this.isWebview = isWebview;
    if (bugsnagKey && settings.ENABLE_BUGSNAG) {
      this.bugsnagIntegrated = true;
      bugsnag.register(bugsnagKey, {
        autoNotify: false
      });
    } else {
      this.bugsnagIntegrated = false;
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
    if (!this.isWebview && this.bugsnagIntegrated) {
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
    // TODO: with IPC
    // store.set('fileLogging', true);
    // return 'Logging Enabled';
  }
  disableLogging() {
    // TODO: with IPC
    // store.set('fileLogging', false);
    // return 'Logging Disabled';
  }
  setLogExpiry(logExpiry) {
    // TODO: with IPC
    // if (logExpiry > 0 && logExpiry <= 60)
    // store.set('LOGS_EXPIRY', logExpiry);
  }
}
module.exports = Logger;