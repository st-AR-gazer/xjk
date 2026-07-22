function createSafeEventSink(callback) {
  if (typeof callback !== "function") return () => {};
  return (sample = {}) => {
    try {
      callback(sample);
    } catch {
      return;
    }
  };
}

export { createSafeEventSink };
