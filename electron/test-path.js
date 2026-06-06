const { app } = require('electron');
app.on('ready', () => {
    console.log("Documents path: ", app.getPath('documents'));
    app.quit();
});
