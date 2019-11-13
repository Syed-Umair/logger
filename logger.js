/**
 * Logger Module
 * Each logger object automatically detects the process type,
 * creates seperate log based on its process type.
 */
const winston = require('winston');
const { shell } = require('electron');
const fs = require('fs-extra');
const util = require('util');
const path = require('path');
const archiver = require('archiver');
const appRootDirectory = require('app-root-dir');
const EventEmitter = require('events');
let settings;
let ipc;
let instanceList = new Map();
let loggerEvents = new EventEmitter();
const SETTING_LIST = ['FILE_LOGGING', 'LOGS_EXPIRY', 'SESSION'];
const APP_NAME = getAppName() || 'electron-app';
const LOGSDIR = path.join(getAppDataLoc(), `${APP_NAME}-logs`);
const CUSTOMLEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

/**
 * Creating logger session settings in global
 * Setting IPC handlers to recieve settings
 */
if (process.type === 'browser') {
  global.loggerSettings = {
    FILE_LOGGING: true,
    SESSION: createNewSession(),
    LOGS_EXPIRY: 7
  };
  var { webContents, ipcMain } = require('electron');
  ipc = ipcMain;
  ipc.on('updateSettings', mainSettingsHandler);
} else {
  ipc = require('electron').ipcRenderer;
  ipc.on('updateSettings', rendererSettingsHandler);
}

/**
 * Caching settings locally
 */
settings = getSettings();

/**
 * Returns loggerSettings
 * @return {object} loggerSettings
 */
function getSettings() {
  if (settings) return settings;

  if (process.type === 'browser') {
    return global.loggerSettings;
  } else {
    let { remote } = require('electron');
    return remote.getGlobal('loggerSettings');
  }
}

/**
 * Returns default Options for Logger Configuration
 * @return {object} Logger Instance Configuration
 */
function getDefaultOptions() {
  let options = {
    fileName: '',
    isWebview: false,
    type: process.type
  };
  //calculate name based on main-file-location
  options.fileName = process.mainModule
    ? path.basename(process.mainModule.filename)
    : getUniqueId();
  return options;
}

/**
 * Generates UniqueId using Math.Random
 * @return {string} unique string
 */
function getUniqueId() {
  return Math.floor(Math.random() * 10000000000 + 1).toString();
}

/**
 * Handles Update Setting Request in main and push to all renderers
 */
function mainSettingsHandler() {
  for (let setting of arguments) {
    if (
      setting.hasOwnProperty('name') &&
      SETTING_LIST.indexOf(setting.name) != -1
    ) {
      global.loggerSettings[setting.name] = setting.value;
      settings[setting.name] = setting.value;
      if (setting.name === 'SESSION') {
        instanceList.forEach((context) => {
          updateSession(context, setting.value);
        });
      }
      if (setting.push) {
        delete setting.push;
        webContents.getAllWebContents().forEach(webContent => {
          webContent.send('updateSettings', setting);
        });
      }
    }
  }
}

/**
 * Handles Update Setting Request in renderer and push to request to main
 */
function rendererSettingsHandler() {
  for (let setting of arguments) {
    if (
      setting.hasOwnProperty('name') &&
      SETTING_LIST.indexOf(setting.name) !== -1
    ) {
      settings[setting.name] = setting.value;
      if (setting.name === 'SESSION') {
        loggerEvents.emit('newLoggerSession', setting.value.folder);
        instanceList.forEach((context) => {
          updateSession(context, setting.value);
        });
      }
      if (setting.push) {
        ipc.send('updateSettings', setting);
      }
    }
  }
}

/**
 * Assigns Handler based on process type
 * @param {Object} setting
 */
function handleSetting(setting) {
  if (process.type === 'browser') {
    mainSettingsHandler(setting);
  } else {
    rendererSettingsHandler(setting);
  }
}

function getTimeStamp() {
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
}

const logFormat = winston.format.printf((info) => {
  return `${getTimeStamp()}::${info.level}::${info.message}`;
});

/**
 * Setting up configuration for winston file transport and returns config object
 * @param  {String} type
 * @param  {Boolean} isWebview
 * @param  {String} fileName
 * @return {Object} config
 */
function getConfig(type, isWebview, fileName, sessionFolder) {
  let filename = null;
  let config = {
    filename: null
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
  // let sessionFolder = settings.SESSION;
  config.filename = path.join(LOGSDIR, sessionFolder, filename);
  return config;
}

/**
 * appdata location based on platform
 * @return {String} path
 */
function getAppDataLoc() {
  if (/^win/.test(process.platform))
    return path.join(process.env.USERPROFILE, 'AppData', 'local');
  else return path.join(process.env.HOME, 'Library', 'Application Support');
}

/**
 * returns the application name from the parent package.json
 * @return {String} AppName
 */
function getAppName() {
  try {
    let manifest = require(`${path.join(
      appRootDirectory.get(),
      'package.json'
    )}`);
    if (manifest) {
      return manifest.name;
    }
  } catch (e) {
    console.error(e);
  }
}

/**
 * creates session timestamp
 * @return {String} timestamp
 */
function createNewSession() {
  let date = new Date();
  let datePart = `${date.toLocaleString('en-US', {
    day: '2-digit'
  })}-${date.toLocaleString('en-US', {
    month: 'short'
  })}-${date.toLocaleString('en-US', {
    year: 'numeric'
  })}`;
  let hourPart = `${date.toLocaleString('en-US', {
    hour: '2-digit',
    hour12: false
  })}-00`;
  let session = path.join(datePart, hourPart);
  return {
      folder: session,
      time: date.getTime()
  };
}

/**
 * Log expiry time in milliseconds
 * @return {Number} expiryTime
 */
function getLogExpiry() {
  return new Date().getTime() - 24 * 60 * 60 * 1000 * settings.LOGS_EXPIRY;
}

/**
 * Converts input content to String using util.inspect
 * @param  {Array} content
 * @return {String} data
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
 * @param {String} path
 * @param {Boolean} includeZip
 * @return {Array} files
 */
async function getContents(path, includeZip = false) {
  try {
    let contents = await fs.readdir(path);
    return contents.filter(function(file) {
      if (includeZip) {
        return !/^\./.test(file);
      } else {
        return !(/^\./.test(file) || /.zip$/.test(file));
      }
    });
  } catch (e) {
    console.error(e);
  }
}

/**
 * Finds file creation time and returns file creation time in ms
 * @param  {String} file
 * @return {Number} creationTime
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
 * @return {Promise} resolves Zip file location
 */
async function getRecentLogs() {
  try {
    let zip = archiver('zip', {
        zlib: { level: 9 }
    });
    let zipName = `logs-${Date.now()}.zip`;
    let sessions = await getContents(LOGSDIR);
    let output = fs.createWriteStream(path.join(LOGSDIR, zipName));
    zip.pipe(output);
    for (let session of sessions) {
      if ((await getLogCreationTime(session)) >= getLogExpiry()) {
        zip.directory(path.join(LOGSDIR, session), session);
      }
    }
    await zip.finalize();
    return new Promise(resolve => {
        output.on('finish', () => {
            resolve(path.join(LOGSDIR, zipName));
        });
    });
  } catch (e) {
    console.error(e);
  }
}

/**
 * Deletes logs Older than @LOGS_EXPIRY
 * @return {Promise} resolves older logs cleared message
 */
async function pruneOldLogs() {
  try {
    let sessions = await getContents(LOGSDIR, true);
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

function updateSession(context, session) {
  context.logAPI
    .clear()
    .add(new winston.transports.File(getConfig(context.type, context.isWebview, context.fileName, session.folder)));
  if (context.isWebview) {
    context.logAPI.add(new winston.transports.Console());
  }
}

function checkSessionAndUpdate(context) {
  if(typeof settings.SESSION === 'object' && settings.SESSION.time && settings.SESSION.folder) {
    let sessionDate = new Date(settings.SESSION.time);
    let now = new Date();
    let hourDifference = now.getHours() - sessionDate.getHours();
    if (hourDifference >= 1) {
      let newSession = createNewSession();
      handleSetting({
        name: 'SESSION',
        value: newSession,
        push: true
      });
    }
  }
}

/**
 * Logs the content
 * @param {Object} context
 * @param {String} content
 * @param {String} level
 */
async function logIt(context, content, level) {
  try {
    if (settings.FILE_LOGGING) {
      if (process.type === 'browser') {
        checkSessionAndUpdate(context);
      }
      if (!fs.existsSync(LOGSDIR)) {
        fs.mkdirpSync(LOGSDIR);
      }
      if (!fs.existsSync(path.join(LOGSDIR, settings.SESSION.folder))) {
        fs.mkdirpSync(path.join(LOGSDIR, settings.SESSION.folder));
      }
      context.logAPI[level](getMessage(content));
    }
  } catch (e) {
    console.error(e);
  }
}

/**
 * Gives the domain
 * @param {String} url
 * @returns {String} reduced url
 */
function parseDomain(url) {
  let domain = url.match(/\/\/(.+?)\//)
    ? url.match(/\/\/(.+?)\//).pop()
    : url.match(/\/\/(.+)/)
      ? url.match(/\/\/(.+)/).pop()
      : url;
  return domain;
}

class Logger {
  constructor(
    {
      fileName = getUniqueId(),
      isWebview = false,
      type = process.type
    } = getDefaultOptions()
  ) {
    // A patch to fix the logger in the test mode
    if (!settings){
      console.logAPI = {
        on: function(){}
      }
      return console;
    }
    if (fileName) {
      fileName = parseDomain(fileName);
    }
    if (!isWebview && instanceList.has(fileName)) {
      return instanceList.get(fileName);
    }
    pruneOldLogs();
    let transports = [
      new winston.transports.File(getConfig(type, isWebview, fileName, settings.SESSION.folder)),
      new winston.transports.Console()
    ];
    if (isWebview) {
      transports.pop();
    }
    this.logAPI = winston.createLogger({
      level: 'debug',
      exitOnError: false,
      levels: CUSTOMLEVELS.levels,
      format: winston.format.combine(
        winston.format.prettyPrint(),
        logFormat
      ),
      transports
    });
    this.isWebview = isWebview;
    this.fileName = fileName;
    this.type = type;
    instanceList.set(fileName, this);
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
  }
  pruneOldLogs() {
    return pruneOldLogs();
  }
  getLogArchive() {
    return getRecentLogs();
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
    handleSetting({
      name: 'FILE_LOGGING',
      value: true,
      push: true
    });
    return 'Logging Enabled';
  }
  disableLogging() {
    settings.FILE_LOGGING = false;
    handleSetting({
      name: 'FILE_LOGGING',
      value: false,
      push: true
    });
    return 'Logging Disabled';
  }
  setLogExpiry(logExpiry) {
    logExpiry = parseInt(logExpiry);
    if (logExpiry > 0 && logExpiry <= 30) {
      settings.LOGS_EXPIRY = logExpiry;
      handleSetting({
        name: 'LOGS_EXPIRY',
        value: logExpiry,
        push: true
      });
      return `Logs Expiry set to ${logExpiry}`;
    }
  }
  onNewSession(cb) {
    if (typeof cb === "function") {
        loggerEvents.on('newLoggerSession', cb);
    }
  }
}
module.exports = Logger;
