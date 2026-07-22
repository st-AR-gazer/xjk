function toPrettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function createJsonResponse(status, label, payload) {
  return {
    status,
    label,
    body: toPrettyJson(payload),
  };
}

function createOkResponse(label, payload) {
  return [createJsonResponse(200, label, payload)];
}

export { createJsonResponse, createOkResponse, toPrettyJson };
