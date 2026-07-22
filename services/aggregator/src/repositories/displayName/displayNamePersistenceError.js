class DisplayNamePersistenceError extends Error {
  constructor(operation, cause) {
    super(`Display-name storage operation failed: ${operation}`, { cause });
    this.name = "DisplayNamePersistenceError";
    this.code = "DISPLAY_NAME_PERSISTENCE_ERROR";
    this.operation = operation;
  }
}

function runDisplayNamePersistenceOperation(operation, action) {
  try {
    return action();
  } catch (cause) {
    if (cause instanceof DisplayNamePersistenceError) throw cause;
    throw new DisplayNamePersistenceError(operation, cause);
  }
}

function runDisplayNameTransaction(db, operation, action) {
  return runDisplayNamePersistenceOperation(operation, () => {
    db.exec("BEGIN");
    try {
      const result = action();
      db.exec("COMMIT");
      return result;
    } catch (cause) {
      try {
        db.exec("ROLLBACK");
      } catch (rollbackCause) {
        throw new AggregateError([cause, rollbackCause], `Display-name transaction rollback failed: ${operation}`);
      }
      throw cause;
    }
  });
}

export { DisplayNamePersistenceError, runDisplayNamePersistenceOperation, runDisplayNameTransaction };
