# logger

* Each logger object is automatically detects the process type 

* and creates seperate log based on its process type.

* If any error occurs it is automatically notified using bugsnag,

* You can set LOGS_EXPIRY = no. of days to get the corresponding logs

* Create object of class by requiring 'logger' module

* Also we support bugsnag here so you can register your bugsnag by uncommenting 

* include bugsnagKey : &lt;yourAPIkey&gt; in your package.json 

* by default bugsnag.notify is added to the error method.

* Example:

*     logger = new logger({

*         [fileName: &lt;custom filename&gt;,]

*         [isWebview = &lt;boolean value stating whether its a webview logs&gt;,]

*         [domain = &lt;title or info stating its presence&gt;]

*     });

*     logger.&lt;level&gt;(&lt;message&gt;);

*     logger.pruneOldLogs().then(result=&gt;console.log(result)); 

* Note :

*       getLogArchive(), clearLogArchive() and pruneOldLogs() return promise.