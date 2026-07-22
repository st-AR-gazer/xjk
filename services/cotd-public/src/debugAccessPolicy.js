function rawDebugAccessAllowed({ requested, enabled, adminConfigured, authenticated } = {}) {
  const wantsDebug = ["1", "true", "yes"].includes(
    String(requested || "")
      .trim()
      .toLowerCase()
  );
  return Boolean(wantsDebug && enabled && adminConfigured && authenticated);
}

export { rawDebugAccessAllowed };
