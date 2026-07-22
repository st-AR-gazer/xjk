const DAY_MS = 24 * 60 * 60 * 1000;
const MIB = 1024 * 1024;

const VALIDIFIER_HARDENING_SETTINGS = Object.freeze([
  Object.freeze({
    key: "VALIDIFIER_PUBLIC_ARTIFACT_TTL_MS",
    defaultValue: 7 * DAY_MS,
    minimum: 60 * 1000,
  }),
  Object.freeze({
    key: "VALIDIFIER_PUBLIC_SUBMISSION_TTL_MS",
    defaultValue: 7 * DAY_MS,
    minimum: 60 * 1000,
  }),
  Object.freeze({
    key: "VALIDIFIER_PUBLIC_UPLOAD_BYTES_PER_DAY",
    defaultValue: 256 * MIB,
    minimum: 1,
  }),
  Object.freeze({
    key: "VALIDIFIER_PUBLIC_UPLOAD_GLOBAL_BYTES_PER_DAY",
    defaultValue: 2 * 1024 * MIB,
    minimum: 1,
  }),
  Object.freeze({
    key: "VALIDIFIER_PUBLIC_UPLOAD_MAX_CONCURRENT",
    defaultValue: 2,
    minimum: 1,
  }),
  Object.freeze({
    key: "VALIDIFIER_PUBLIC_UPLOAD_GLOBAL_MAX_CONCURRENT",
    defaultValue: 8,
    minimum: 1,
  }),
]);

function resolveIntegerSetting(environment, setting) {
  const rawValue = environment?.[setting.key];
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return setting.defaultValue;
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < setting.minimum) {
    return setting.defaultValue;
  }
  return value;
}

function resolveValidifierHardeningSettings(environment = process.env) {
  return Object.fromEntries(
    VALIDIFIER_HARDENING_SETTINGS.map((setting) => [setting.key, resolveIntegerSetting(environment, setting)])
  );
}

export { VALIDIFIER_HARDENING_SETTINGS, resolveValidifierHardeningSettings };
