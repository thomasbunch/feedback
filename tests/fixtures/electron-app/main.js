const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
  console.log("Electron app ready");
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});
