/**
 * Logger Module
 * Each logger object is automatically detects the process type 
 * and creates seperate log based on its process type.
 * If any error occurs it is automatically notified using bugsnag,
 * You can set LOGS_EXPIRY = no. of days to get the corresponding logs
 * Create object of class by requiring 'logger' module
 * Also we support bugsnag here so you can register your bugsnag by uncommenting 
 * bugsnag.register(yourtoken)
 * by default notify is added to the error method.
 * Example:
 *     logger = new logger({
 *         [fileName: <custom filename>,]
 *         [isWebview = <boolean value stating whether its a webview logs>,]
 *         [domain = <title or info stating its presence>]
 *     });
 *     logger.<level>(<message>);
 *     logger.uploadLogs()[or pruneOldLogs()].then(result=>console.log(result)); 
 * Note :
 *     uploadLogs() and pruneOldLogs() return promise.
 */
let winston = require("winston");
let fs = require("graceful-fs");
let util = require("util");
let path = require("path");
let jsZip = require("jszip");
let bugsnag = require("bugsnag");
let formData = require("form-data");
let promisify = require("./promisify.js");
let readdirPromise = promisify(fs.readdir);
let statPromise = promisify(fs.stat);
let readFilePromise = promisify(fs.readFile);
let unlinkPromise = promisify(fs.unlink);
//bugsnag.register('add bugsnag token here');
const LOGS_EXPIRY = 7;
const LOGSDIR = path.join(
  getAppDataLoc(),
  `${require("../../package.json").name}-logs`
);
const CUSTOMLEVELS = {
  levels: {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  },
  colors: {
    debug: "blue",
    info: "green",
    warn: "yellow",
    error: "red"
  }
};
/**
 * Setting up configuration for winston file transport and returns config object
 * @param  {process type}
 * @param  {pid Number}
 * @param  {Boolean}
 * @param  {string}
 * @return {object}
 */
function getConfig(type, pid, isWebview, domain = "webview", fileName) {
  let filename = null;
  let config = {
    prettyPrint: true,
    levels: CUSTOMLEVELS.levels,
    json: false,
    colorize: true,
    filename: null,
    timestamp: function() {
      let now = new Date();
      return `${now.toLocaleString("en-US", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      })}.${now.getMilliseconds()}`;
    },
    formatter: function(options) {
      return `${options.timestamp()}::${options.level}::${options.message}`;
    }
  };
  switch (type) {
    case "renderer":
      if (isWebview) {
        filename = `${domain}.log`;
      } else {
        filename = `renderer-${pid}.log`;
      }
      break;
    case "browser":
      filename = `main-${pid}.log`;
      break;
    default:
      filename = `default-${pid}.log`;
  }
  if (fileName) {
    filename = filename.replace(/^/, `${fileName}-`);
  }
  config.filename = path.join(LOGSDIR, filename);
  return config;
}
/**
 * appdata location based on platform
 * @return {string}
 */
function getAppDataLoc() {
  return (
    process.env.LOCALAPPDATA ||
    path.join(process.env.HOME, "/Library/Application Support")
  );
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
  let data = "";
  for (let value of content) {
    data += util.inspect(value) + "\n\t";
  }
  return data;
}
/**
 * Finds all log files in the @LOGSDIR and returns log files array
 * @return {array}
 */
async function getLogs() {
  try {
    let log_ext = new RegExp(".*.log");
    let files = await readdirPromise(LOGSDIR);
    return files.filter(file => log_ext.test(file));
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
async function getLogBirthTime(file) {
  try {
    let stat = await statPromise(path.join(LOGSDIR, file));
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
    let logs = await getLogs();
    for (let file of logs) {
      if ((await getLogBirthTime(file)) >= getLogExpiry())
        zip.file(file, await readFilePromise(path.join(LOGSDIR, file)));
    }
    return new Promise(resolve => {
      zip
        .generateNodeStream({
          type: "nodebuffer",
          streamFiles: true,
          compression: "DEFLATE"
        })
        .pipe(fs.createWriteStream(path.join(LOGSDIR, "logs.zip")))
        .on("finish", () => {
          resolve(path.join(LOGSDIR, "logs.zip"));
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
    let logs = await getLogs();
    for (let file of logs) {
      if ((await getLogBirthTime(file)) < getLogExpiry()) {
        await unlinkPromise(path.join(LOGSDIR, file));
      }
    }
    return `Logs older than ${LOGS_EXPIRY} day(s) Cleared`;
  } catch (e) {
    console.log(e);
    return e;
  }
}
/**
 * Uses FORMDATA to upload log archive to server.
 * @return {promise}
 */
async function uploadLogs() {
  try {
    let form = new formData();
    let zipPath = await getRecentLogs();
    form.append("fileToUpload", fs.createReadStream(zipPath));
    form.submit("http://localhost/test/upload.php", function(error, result) {
      if (error) throw error;
    });
    await unlinkPromise(zipPath);
    return `Last ${LOGS_EXPIRY} day(s) Logs Submitted.`;
  } catch (e) {
    console.log(e);
    return e;
  }
}

class Logger {
  constructor({
    fileName = "",
    isWebview = false,
    domain = null,
    type = process.type,
    pid = process.pid
  }) {
    if (!fs.existsSync(LOGSDIR)) {
      fs.mkdirSync(LOGSDIR);
    }
    pruneOldLogs();
    this.logger = new winston.Logger({
      level: "error",
      levels: CUSTOMLEVELS.levels,
      transports: [
        new winston.transports.File(
          getConfig(type, pid, isWebview, domain, fileName)
        ),
        new winston.transports.Console({ colorize: true })
      ]
    });
    winston.addColors(CUSTOMLEVELS.colors);
  }
  debug(...content) {
    this.logger.debug(getMessage(content));
  }
  log(...content) {
    this.logger.info(getMessage(content));
  }
  info(...content) {
    this.logger.info(getMessage(content));
  }
  warn(...content) {
    this.logger.warn(getMessage(content));
  }
  error(...content) {
    let data = getMessage(content);
    this.logger.error(data);
    // bugsnag.notify(new Error(data));
  }
  uploadLogs() {
    return uploadLogs();
  }
  pruneOldLogs() {
    return pruneOldLogs();
  }
}
module.exports = Logger;
