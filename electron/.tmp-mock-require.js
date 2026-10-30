const fs = require('fs');
const RESULT = '/home/yenai/Documents/Projects/Typing/ai.type/electron/.tmp-mock-result.json';
const Module = require('module');
const origLoad = Module._load;
const seen = [];
Module._load = function (request, parent, isMain) {
  if (parent && String(parent.filename || '').includes('main.js')) seen.push(request);
  if (request === 'electron') {
    return {
      ipcMain: { handle: () => {}, on: () => {} },
      app: { whenReady: () => Promise.resolve(), getPath: () => '/tmp', on: () => {}, quit: () => {}, getVersion: () => '1.2.3', isPackaged: true },
      BrowserWindow: class { constructor() { return { loadFile: () => Promise.resolve(), loadURL: () => Promise.resolve(), on: () => {}, webContents: { on: () => {}, send: () => {} } }; } static getAllWindows() { return []; } },
      nativeTheme: { on: () => {} },
      shell: { openExternal: () => Promise.resolve() },
      dialog: {},
      net: {},
      protocol: { registerFileProtocol: () => {}, handle: () => {}, registerSchemesAsPrivileged: () => {} },
      session: { defaultSession: { setPermissionRequestHandler: () => {} } },
      Menu: { setApplicationMenu: () => {}, buildFromTemplate: () => ({}) },
      Notification: class { show() {} },
      powerMonitor: { on: () => {} },
      globalShortcut: { register: () => {}, unregister: () => {}, unregisterAll: () => {} },
      clipboard: { readText: () => '', writeText: () => {} },
    };
  }
  return origLoad.call(this, request, parent, isMain);
};
process.on('uncaughtException', (e) => { fs.writeFileSync(RESULT, JSON.stringify({ loadError: String(e && e.stack || e) }, null, 2)); process.exit(1); });
try { require('/home/yenai/Documents/Projects/Typing/ai.type/electron/dist/main.js'); } catch (e) { fs.writeFileSync(RESULT, JSON.stringify({ loadError: String(e && e.stack || e) }, null, 2)); process.exit(1); }
const hasV2 = seen.some((r) => r.includes('edge-tts-v2'));
fs.writeFileSync(RESULT, JSON.stringify({ sawEdgeTtsV2: hasV2, localRequires: seen.filter((r) => r.startsWith('./') || r.startsWith('../')) }, null, 2));
process.exit(0);
