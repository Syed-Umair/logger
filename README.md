# logger
Logger for Electron Applications

Each logger object is automatically detects the process type and creates seperate log based on its process type.<br/>
If any error occurs it is automatically notified using bugsnag, You can set LOGS_EXPIRY = no. of days to get the corresponding logs.<br/>

Create object of class by requiring 'logger' module<br/>
Example:<br/>
________logger = new logger({<br/>
________[fileName: <custom filename>,]<br/>
__________[isWebview = <boolean value stating whether its a webview logs>,]<br/>
__________[domain = <title or info stating its presence>]<br/>
________});<br/>
      logger.<level>(<message>);<br/>
      logger.uploadLogs()[or pruneOldLogs()].then(result=>console.log(result));<br/>
Note :<br/>
      uploadLogs() and pruneOldLogs() return promise.
