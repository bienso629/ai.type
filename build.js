const { app, globalShortcut, BrowserWindow, ipcMain, Menu } = require('electron');
const url = require("url");
const path = require("path");

let windows = new Set();
// let window; 

function createWindow() {
  window = new BrowserWindow({
    width: 1980,
    height: 1080,
    backgroundColor: '#212121',
    fullscreen: true,
    show: false,
    autoHideMenuBar: false,
    frame: true,
    webPreferences: {
      sandbox: false,
      contextIsolation: false,
      enableRemoteModule: false,
      webSecurity: false,
      webviewTag: false,
      devTools: false,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      preload: path.join(__dirname, 'preload.js')
    },
  });

  windows.add(window);
  // windows.forEach((w, i) => {
  //   if (i === 0) {
  //     w.show();
  //   }
  // });

  window.loadURL(
    url.format({
      pathname: path.join(__dirname, `/build/dist/fuse/index.html`),
      protocol: "file:",
      slashes: true
    })
  );

  window.webContents.openDevTools({ mode: 'detach', activate: false });

  // window.webContents.setWindowOpenHandler((details) => {
  //   return {
  //     action: 'deny',
  //     createWindow: async (options) => {
  //       const browserView = new BrowserView(options);
  //       await browserView.webContents.loadURL('https://electronjs.org');
  //       await window.addBrowserView(browserView);
  //       // browserView.setBounds({ x: 10, y: 10, width: 640, height: 480 });
  //       return browserView.webContents;
  //     }
  //   }
  // });

  window.on("closed", () => {
    windows.clear();
    // windows.delete(window);
    // window = null;
  });

  const menu = Menu.buildFromTemplate([{
    label: 'Ứng dụng',
    submenu: [
      {
        label: 'Thoát',
        role: 'quit'
      }
    ]
  }, {
    label: 'Văn bản',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteandmatchstyle' },
      { role: 'delete' },
      { role: 'selectall' },
    ],
  }, {
    label: 'Cửa sổ',
    role: 'windowMenu'
  }])

  Menu.setApplicationMenu(menu)

  // Open the DevTools. If you don't want you delete this
  // window.webContents.openDevTools()

  window.on('ready-to-show', () => {
    window.maximize();
    window.show();
    // 删除窗口的菜单栏。(Remove the window's menu bar.)
    window.removeMenu();
  });
}

// Function to create child window of parent one 
function createChildWindow() { 
  childWindow = new BrowserWindow({ 
    width: 600, 
    height: 700, 
    modal: true, 
    show: false, 
    parent: window, // Make sure to add parent window here 
  
    // Make sure to add webPreferences with below configuration 
    webPreferences: { 
      nodeIntegration: true, 
      contextIsolation: false, 
      enableRemoteModule: true, 
    }, 
  }); 
  
  // Child window loads settings.html file 
  childWindow.loadFile("settings.html"); 
  
  childWindow.once("ready-to-show", () => { 
    childWindow.show(); 
  }); 
} 

ipcMain.on("openChildWindow", (event, arg) => { 
  createChildWindow();
}); 

app.whenReady().then(() => { 
  createWindow(); 
  
  app.on("activate", () => { 
    if (BrowserWindow.getAllWindows().length === 0) { 
      createWindow(); 
    } 
  }); 
}); 
  
app.on("window-all-closed", () => { 
  if (process.platform !== "darwin") { 
    app.quit(); 
  } 
}); 

app.on('browser-window-focus', function () {
  globalShortcut.register("CommandOrControl+R", () => {
    console.log("CommandOrControl+R is pressed: Shortcut Disabled");
  });

  globalShortcut.register("F5", () => {
    console.log("F5 is pressed: Shortcut Disabled");
  });
});

app.on('browser-window-blur', function () {
  globalShortcut.unregister('CommandOrControl+R');
  globalShortcut.unregister('F5');
});