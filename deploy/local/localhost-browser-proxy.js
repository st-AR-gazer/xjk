import http from "node:http";
import net from "node:net";

const PORT = parseInt(process.env.LOCALHOST_BROWSER_PROXY_PORT || "8877", 10);
const LOOPBACK_HOST = "127.0.0.1";

function isLocalhostHost(hostname) {
  const safeHost = String(hostname || "").toLowerCase();
  return safeHost === "localhost" || safeHost.endsWith(".localhost");
}

function toTargetFromUrl(urlString, hostHeader) {
  try {
    const url = new URL(urlString);
    return {
      hostname: url.hostname.toLowerCase(),
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
      path: `${url.pathname || "/"}${url.search || ""}`,
      authority: url.port ? `${url.hostname}:${url.port}` : url.hostname,
    };
  } catch {
    if (!hostHeader) {
      return null;
    }

    try {
      const fallback = new URL(`http://${hostHeader}${urlString}`);
      return {
        hostname: fallback.hostname.toLowerCase(),
        port: Number(fallback.port || 80),
        path: `${fallback.pathname || "/"}${fallback.search || ""}`,
        authority: fallback.port ? `${fallback.hostname}:${fallback.port}` : fallback.hostname,
      };
    } catch {
      return null;
    }
  }
}

function writeError(resOrSocket, statusCode, message) {
  const payload = `${message}\n`;
  if (typeof resOrSocket.writeHead === "function") {
    resOrSocket.writeHead(statusCode, {
      "content-type": "text/plain; charset=utf-8",
      "content-length": Buffer.byteLength(payload),
      "cache-control": "no-store",
    });
    resOrSocket.end(payload);
    return;
  }

  resOrSocket.end(
    `HTTP/1.1 ${statusCode} ${message}\r\n` +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(payload)}\r\n` +
      "Connection: close\r\n" +
      "\r\n" +
      payload
  );
}

function pacScript() {
  return [
    "function FindProxyForURL(url, host) {",
    "  host = String(host || '').toLowerCase();",
    "  if (shExpMatch(host, '*.localhost')) {",
    `    return 'PROXY 127.0.0.1:${PORT}; DIRECT';`,
    "  }",
    "  return 'DIRECT';",
    "}",
    "",
  ].join("\n");
}

function proxyHttpRequest(clientReq, clientRes) {
  if (clientReq.method === "GET" && (clientReq.url === "/__health" || clientReq.url === "/health")) {
    const payload = JSON.stringify({ ok: true, port: PORT });
    clientRes.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(payload),
      "cache-control": "no-store",
    });
    clientRes.end(payload);
    return;
  }

  if (clientReq.method === "GET" && (clientReq.url === "/proxy.pac" || clientReq.url === "/localhost-proxy.pac")) {
    const payload = pacScript();
    clientRes.writeHead(200, {
      "content-type": "application/x-ns-proxy-autoconfig; charset=utf-8",
      "content-length": Buffer.byteLength(payload),
      "cache-control": "no-store",
    });
    clientRes.end(payload);
    return;
  }

  const target = toTargetFromUrl(clientReq.url, clientReq.headers.host);
  if (!target) {
    writeError(clientRes, 400, "Invalid proxy request.");
    return;
  }

  if (!isLocalhostHost(target.hostname)) {
    writeError(clientRes, 403, "This proxy only forwards localhost subdomains.");
    return;
  }

  const headers = { ...clientReq.headers };
  delete headers["proxy-connection"];
  delete headers["proxy-authorization"];
  headers.host = target.authority;

  const upstreamReq = http.request(
    {
      host: LOOPBACK_HOST,
      port: target.port,
      method: clientReq.method,
      path: target.path,
      headers,
    },
    (upstreamRes) => {
      clientRes.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(clientRes);
    }
  );

  upstreamReq.on("error", (error) => {
    writeError(clientRes, 502, `Upstream connection failed: ${error.message}`);
  });

  clientReq.pipe(upstreamReq);
}

function proxyUpgrade(clientReq, clientSocket, head) {
  const target = toTargetFromUrl(clientReq.url, clientReq.headers.host);
  if (!target || !isLocalhostHost(target.hostname)) {
    writeError(clientSocket, 403, "This proxy only forwards localhost subdomains.");
    return;
  }

  const upstreamSocket = net.connect(target.port, LOOPBACK_HOST, () => {
    const headers = { ...clientReq.headers };
    delete headers["proxy-connection"];
    delete headers["proxy-authorization"];
    headers.host = target.authority;

    const headerLines = Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\r\n");

    upstreamSocket.write(`${clientReq.method} ${target.path} HTTP/${clientReq.httpVersion}\r\n${headerLines}\r\n\r\n`);
    if (head && head.length) {
      upstreamSocket.write(head);
    }
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });

  upstreamSocket.on("error", (error) => {
    writeError(clientSocket, 502, `Upstream upgrade failed: ${error.message}`);
  });

  clientSocket.on("error", () => {
    upstreamSocket.destroy();
  });
}

function proxyConnect(clientReq, clientSocket, head) {
  const separator = clientReq.url.lastIndexOf(":");
  const hostname = separator >= 0 ? clientReq.url.slice(0, separator).toLowerCase() : clientReq.url.toLowerCase();
  const port = separator >= 0 ? Number(clientReq.url.slice(separator + 1)) : 443;

  if (!hostname || !Number.isInteger(port) || !isLocalhostHost(hostname)) {
    writeError(clientSocket, 403, "This proxy only tunnels localhost subdomains.");
    return;
  }

  const upstreamSocket = net.connect(port, LOOPBACK_HOST, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head && head.length) {
      upstreamSocket.write(head);
    }
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });

  upstreamSocket.on("error", (error) => {
    writeError(clientSocket, 502, `Upstream tunnel failed: ${error.message}`);
  });

  clientSocket.on("error", () => {
    upstreamSocket.destroy();
  });
}

const server = http.createServer(proxyHttpRequest);
server.on("upgrade", proxyUpgrade);
server.on("connect", proxyConnect);

server.listen(PORT, LOOPBACK_HOST, () => {
  console.log(`Localhost browser proxy listening on http://${LOOPBACK_HOST}:${PORT}`);
});
