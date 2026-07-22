function isProcessAlive(pid) {
  const safePid = Number(pid);
  if (!Number.isFinite(safePid) || safePid <= 0) return false;
  try {
    process.kill(safePid, 0);
    return true;
  } catch {
    return false;
  }
}

export { isProcessAlive };
