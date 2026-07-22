function writeJsonResponse(res, statusCode, payload, { headers = {} } = {}) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function writeTextResponse(res, statusCode, body, { contentType = "text/plain; charset=utf-8", headers = {} } = {}) {
  res.writeHead(statusCode, {
    "content-type": contentType,
    ...headers,
  });
  res.end(body);
}

function writeRedirectResponse(res, location, { statusCode = 302, headers = {} } = {}) {
  res.writeHead(statusCode, {
    location,
    ...headers,
  });
  res.end();
}

export { writeJsonResponse, writeRedirectResponse, writeTextResponse };
