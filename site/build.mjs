import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = fileURLToPath(new URL(".", import.meta.url));
const distRoot = join(siteRoot, "dist");
const serverRoot = join(distRoot, "server");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"]
]);

await rm(distRoot, { force: true, recursive: true });
await mkdir(serverRoot, { recursive: true });

const assetPaths = ["index.html", "styles.css", "app.js"];
assetPaths.push(...(await listFiles(join(siteRoot, "assets"))));

const assets = {};

for (const assetPath of assetPaths) {
  const absolutePath = join(siteRoot, assetPath);
  const contentType =
    mimeTypes.get(extname(assetPath)) ?? "application/octet-stream";
  const body = await readFile(absolutePath);
  const route = `/${assetPath.replaceAll("\\", "/")}`;

  assets[route] = {
    body: body.toString("base64"),
    contentType
  };
}

assets["/"] = assets["/index.html"];

const workerSource = `const assets = ${JSON.stringify(assets, null, 2)};

const securityHeaders = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff"
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = normalizePathname(url.pathname);
    const asset = assets[pathname];

    if (!asset) {
      return new Response("Not found", {
        headers: {
          ...securityHeaders,
          "Content-Type": "text/plain; charset=utf-8"
        },
        status: 404
      });
    }

    return new Response(base64ToBytes(asset.body), {
      headers: {
        ...securityHeaders,
        "Cache-Control": cacheControl(pathname),
        "Content-Type": asset.contentType
      },
      status: 200
    });
  }
};

function normalizePathname(pathname) {
  if (pathname === "") {
    return "/";
  }

  if (pathname.endsWith("/") && pathname !== "/") {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function cacheControl(pathname) {
  return pathname.startsWith("/assets/")
    ? "public, max-age=31536000, immutable"
    : "public, max-age=300";
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
`;

await writeFile(join(serverRoot, "index.js"), workerSource);

async function listFiles(root) {
  const paths = [];
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(root, entry.name);

    if (entry.isDirectory()) {
      paths.push(...(await listFiles(absolutePath)));
      continue;
    }

    if (entry.isFile()) {
      paths.push(relative(siteRoot, absolutePath));
    }
  }

  return paths;
}
