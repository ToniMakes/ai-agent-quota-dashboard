const { app, BrowserWindow } = require("electron");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const assetsDir = path.join(projectRoot, "assets");
const svgPath = path.join(assetsDir, "icon.svg");
const traySvgPath = path.join(assetsDir, "tray-icon.svg");
const pngSizes = [16, 24, 32, 48, 64, 128, 256];

app.commandLine.appendSwitch("disable-gpu");
app.disableHardwareAcceleration();

async function renderPng(window, svg, size) {
  const dataUrl = await window.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        document.body.style.margin = "0";
        document.body.style.background = "transparent";
        document.body.innerHTML = '<canvas id="canvas" width="${size}" height="${size}"></canvas>';

        const svg = ${JSON.stringify(svg)};
        const blobUrl = URL.createObjectURL(
          new Blob([svg], { type: "image/svg+xml" })
        );
        const image = new Image();
        const canvas = document.getElementById("canvas");
        const context = canvas.getContext("2d");
        const draw = () => {
          context.clearRect(0, 0, ${size}, ${size});
          context.drawImage(image, 0, 0, ${size}, ${size});
          URL.revokeObjectURL(blobUrl);
          resolve(canvas.toDataURL("image/png"));
        };

        image.onload = draw;
        image.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          reject(new Error("Could not load SVG icon."));
        };
        image.src = blobUrl;
      })
    `);

  return Buffer.from(dataUrl.split(",")[1], "base64");
}

function createIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = header.length + directory.length;

  entries.forEach((entry, index) => {
    const position = index * 16;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, position);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, position + 1);
    directory.writeUInt8(0, position + 2);
    directory.writeUInt8(0, position + 3);
    directory.writeUInt16LE(1, position + 4);
    directory.writeUInt16LE(32, position + 6);
    directory.writeUInt32LE(entry.png.length, position + 8);
    directory.writeUInt32LE(offset, position + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
}

app.whenReady().then(async () => {
  mkdirSync(assetsDir, { recursive: true });

  const window = new BrowserWindow({
    height: 256,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    width: 256
  });
  try {
    await window.loadURL("about:blank");
    await renderIconSet(window, {
      icoPath: path.join(assetsDir, "icon.ico"),
      outputName: "icon",
      svgPath
    });
    await renderIconSet(window, {
      outputName: "tray-icon",
      svgPath: traySvgPath
    });
  } finally {
    window.destroy();
  }

  console.log(`Generated app and tray icon assets in ${assetsDir}`);
  app.exit(0);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
  app.exit(1);
});

async function renderIconSet(window, options) {
  const svg = readFileSync(options.svgPath, "utf8");
  const entries = [];

  for (const size of pngSizes) {
    const png = await renderPng(window, svg, size);
    writeFileSync(path.join(assetsDir, `${options.outputName}-${size}.png`), png);
    entries.push({ png, size });
  }

  writeFileSync(path.join(assetsDir, `${options.outputName}.png`), entries.at(-1).png);

  if (options.icoPath) {
    writeFileSync(options.icoPath, createIco(entries));
  }
}
