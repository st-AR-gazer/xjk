function createConnectionIdentity({ displayNames, helpers }) {
  const { authoritativeSessionIdentity } = displayNames;
  const { sanitizeBridgeDisplayName } = helpers;

  function fromSession(sessionRow) {
    return authoritativeSessionIdentity(sessionRow);
  }

  function applySession(connection, sessionRow) {
    const identity = fromSession(sessionRow);
    connection.applyIdentity(identity);
    return identity;
  }

  function refreshDisplayName(connection) {
    const displayName =
      sanitizeBridgeDisplayName(connection.sessionDisplayName || connection.displayName, {
        accountId: connection.accountId,
      }) || connection.displayName;
    if (displayName) connection.displayName = displayName;
    return connection.displayName;
  }

  return {
    fromSession,
    applySession,
    refreshDisplayName,
  };
}

export { createConnectionIdentity };
