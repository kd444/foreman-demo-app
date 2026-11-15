// Minimal zero-dependency static server + fake password-reset API.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/password-reset") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let email = "";
      try {
        email = JSON.parse(raw).email || "";
      } catch {}
      if (!EMAIL_RE.test(email)) return sendJson(res, 400, { ok: false, error: "Enter a valid email address." });
      // Simulate the mail service taking a moment.
      setTimeout(() => sendJson(res, 200, { ok: true }), 400);
    });
    return;
  }

  if (req.method !== "GET") return sendJson(res, 405, { ok: false });
  const urlPath = req.url.split("?")[0];
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { ok: false });
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("Not found");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`demo app listening on http://localhost:${PORT}`));
