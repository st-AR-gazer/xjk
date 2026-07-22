function validateLookupValue(value, label, { maxLength = 160 } = {}) {
  const trimmed = String(value || "").trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > maxLength) throw new Error(`${label} is too long.`);
  return trimmed;
}

export { validateLookupValue };
