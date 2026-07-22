import { toText, uniqueBy } from "../../../shared/valueUtils.js";

function normalizeCommaSeparatedValues(
  values,
  { normalize = toText, isAllowed = Boolean, makeKey = (value) => value } = {}
) {
  const entries = (Array.isArray(values) ? values : [values])
    .flatMap((value) => String(value || "").split(","))
    .map((value) => normalize(value))
    .filter((value) => isAllowed(value));

  return uniqueBy(entries, makeKey);
}

export { normalizeCommaSeparatedValues };
