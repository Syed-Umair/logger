# logger
Logger for Electron Applications

Each logger object is automatically detects the process type 
and creates seperate log based on its process type.
If any error occurs it is automatically notified using bugsnag,
You can set LOGS_EXPIRY = no. of days to get the corresponding logs
Create object of class by requiring 'logger' module
Example:
      logger = new logger({
          [fileName: <custom filename>,]
          [isWebview = <boolean value stating whether its a webview logs>,]
          [domain = <title or info stating its presence>]
      });
      logger.<level>(<message>);
      logger.uploadLogs()[or pruneOldLogs()].then(result=>console.log(result)); 
Note :
      uploadLogs() and pruneOldLogs() return promise.
