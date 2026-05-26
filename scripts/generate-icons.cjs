const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'frontend', 'public');
const sourceSvg = path.join(publicDir, 'church-logo.svg');
const pngPath = path.join(publicDir, 'church-logo-256.png');
const icoPath = path.join(publicDir, 'church-logo.ico');

function pngToIco(pngBuffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const directory = Buffer.alloc(16);
  directory[0] = 0;
  directory[1] = 0;
  directory[2] = 0;
  directory[3] = 0;
  directory.writeUInt16LE(1, 4);
  directory.writeUInt16LE(32, 6);
  directory.writeUInt32LE(pngBuffer.length, 8);
  directory.writeUInt32LE(header.length + directory.length, 12);

  return Buffer.concat([header, directory, pngBuffer]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    webPreferences: {
      offscreen: true,
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const svg = fs.readFileSync(sourceSvg, 'utf-8');
  const html = `<!doctype html>
    <html>
      <head>
        <style>
          html, body {
            margin: 0;
            width: 256px;
            height: 256px;
            background: transparent;
            overflow: hidden;
          }

          svg {
            display: block;
            width: 256px;
            height: 256px;
          }
        </style>
      </head>
      <body>${svg}</body>
    </html>`;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((resolve) => setTimeout(resolve, 250));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  const pngBuffer = image.toPNG();
  fs.writeFileSync(pngPath, pngBuffer);
  fs.writeFileSync(icoPath, pngToIco(pngBuffer));

  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
