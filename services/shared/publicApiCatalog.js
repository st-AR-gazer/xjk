function normalizePublicApiEndpoints(
  endpoints,
  { defaultHeaders, defaultRemarks, defaultRequestBodyExample, defaultExampleResponses }
) {
  return endpoints.map((endpoint) => ({
    ...endpoint,
    pathParams: Array.isArray(endpoint.pathParams) ? endpoint.pathParams : [],
    queryParams: Array.isArray(endpoint.queryParams) ? endpoint.queryParams : [],
    headers: Array.isArray(endpoint.headers) ? endpoint.headers : defaultHeaders(endpoint),
    remarks: Array.isArray(endpoint.remarks) ? endpoint.remarks : defaultRemarks(endpoint),
    requestBodyExample:
      typeof endpoint.requestBodyExample === "string"
        ? endpoint.requestBodyExample
        : defaultRequestBodyExample(endpoint),
    exampleResponses: Array.isArray(endpoint.exampleResponses)
      ? endpoint.exampleResponses
      : defaultExampleResponses(endpoint),
    notes: Array.isArray(endpoint.notes) ? endpoint.notes : [],
  }));
}

export { normalizePublicApiEndpoints };
