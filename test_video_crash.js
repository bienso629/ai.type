const { app, protocol, net, BrowserWindow } = require('electron');
app.whenReady().then(() => {
    protocol.handle('media', (req) => {
        return net.fetch('file:///' + require('path').resolve('package.json').replace(/\\/g, '/'), { headers: req.headers });
    });
    const win = new BrowserWindow();
    win.loadURL('data:text/html,<video src="media://test"></video>');
    setTimeout(() => app.quit(), 2000);
});
