export function isRequestTimeoutError(error) {
  const name = String(error?.name || "")
    .trim()
    .toLowerCase();
  const message = String(error?.message || "")
    .trim()
    .toLowerCase();
  return (
    name === "timeouterror" ||
    name === "aborterror" ||
    message.includes("timed out") ||
    message.includes("operation timed out")
  );
}

export function isNotFoundError(error) {
  return /\(404\)/.test(String(error?.message || "").trim());
}

export function isTransientGatewayError(error) {
  return /\((502|503|504)\)/.test(String(error?.message || "").trim());
}
