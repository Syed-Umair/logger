# logger-electron

logger-electron is a ease to use logger companion for electron applications.

### Whats Special about this logger?
  - Session based log collection.
  - Automatic removal of logs older than EXPIRY time.
  - Get logs.zip that can be used to submit feedback
  - Integrated Bugsnag to get notified on errors.

![Sample Log File Location](https://raw.githubusercontent.com/Syed-Umair/logger/master/ScreenShots/sample1.PNG)
![Sample Log FileNames in some session folder](https://raw.githubusercontent.com/Syed-Umair/logger/master/ScreenShots/sample2.PNG)

### Log Files location:
  - %localappdata%/<*electron-app*>-logs/ for windows
  - <user>/library/Application Support/<*electron-app*>-logs/ for macos

### Installation

Install the logger-electron.

```sh
$ npm install logger-electron
```

### Getting Started

Create Instance:
```sh
var logger = require("logger-electron");
logger = new logger({
    fileName : "<custom fileName>", //optional, default = empty string
    bugsnagKey : "<api Key>", //optional default = null
    isWebview : "<boolean>", //optional default = false
    domain : "<string>" //optional default = null
});
// For each instance new log file is created.
```

Examples:

```sh
logger = new logger({});
// Creates log file based on the process type renderer or main.

logger = new logger({
  fileName: "customFileName"
});
// Creates customFileName-processType.log file.

logger = new logger({
  bugsnagKey : "<api Key>"
});
// Reports error to registered bugsnag api key.

logger = new logger({
  isWebview : true, 
  domain = "<URL string>"
});
// If its webview errors are not notified using bugsnag if api-key passed.
// URL string passed is added to the log FileName.  
```

### Methods

##### setLogExpiry(logExpiry):
```sh
logger.setLogExpiry(10);
// Deletes logs older than 10 days
// Maximum value is 60 days
```

##### disableLogging():
```sh
logger.disableLogging();
// Disables File Logging
```

##### enableLogging():
```sh
logger.enableLogging();
// Enables File Logging
```

##### pruneOldLogs():
```sh
logger.pruneOldLogs().then((mesg)=>{console.log(mesg)});
// Returns promise
// Manually trigger deletion of logs older than default 7 days or setLogExpiry(logExpiry) days
```

##### getLogArchive():
```sh
logger.getLogArchive().then((path)=>{console.log(path)});
// Returns promise
// On resolve, gives you the path of the logs.zip file.
```

##### clearLogArchive(path):
```sh
logger.clearLogArchive(path);
// Prunes log archive path passed
```

##### debug(data to be logged):
```sh
logger.debug("string"/<object>/<any>);
```

##### log(data to be logged):
```sh
logger.log("string"/<object>/<any>);
```

##### info(data to be logged):
```sh
logger.info("string"/<object>/<any>);
```

##### warn(data to be logged):
```sh
logger.warn("string"/<object>/<any>);
```

##### error(data to be logged):
```sh
logger.error("string"/<object>/<any>);
//pass directly the error object to get better stack trace results in the bugsnag.
```

##### If you want to log the message to console too:

```sh
logger.logAPI.on("logging", function (transport, level, msg, meta) {
  console[level](msg);
});
```

### Todos

 - Write MORE Tests
 - Integrate to travisCI
 - Add Improved bugsnag integration

License
----

MIT
