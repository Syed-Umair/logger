# logger

* Each logger object is automatically detects the process type 

* and creates seperate log based on its process type.

* If any error occurs it is automatically notified using bugsnag,

* You can set LOGS_EXPIRY = no. of days to get the corresponding logs

* Create object of class by requiring 'logger' module

* Also we support bugsnag here so you can register your bugsnag by uncommenting 

* include bugsnagKey : yourAPIkey in your package.json 

* by default bugsnag.notify is added to the error method.

* Example:

*     logger = new logger({

*         [fileName: custom filename,]

*         [isWebview = boolean value stating whether its a webview logs,]

*         [domain = title or info stating its presence]

*     });

*     logger.level(message);

*     logger.pruneOldLogs().then(result=>console.log(result)); 

* Note :

*       getLogArchive(), clearLogArchive() and pruneOldLogs() return promise.
