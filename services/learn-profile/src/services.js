import { createAccountStore } from "./account-store.js";
import { createAdminRoutes } from "./admin-routes.js";
import { createAuthService } from "./auth-service.js";
import { createContentService } from "./content-service.js";
import { createLearnFileStore } from "./file-store.js";
import { createHttpSupport } from "./http-support.js";
import { createIdentityService } from "./identity.js";
import { createLearnDataStore } from "./learn-data-store.js";
import { createProfileRoutes } from "./profile-routes.js";
import { createSessionStore } from "./session-store.js";
import { createStaticService } from "./static-service.js";

export function createLearnProfileServices({
  config,
  fetchImpl,
  logger = console,
  paths,
  sharedAuthStore = null,
} = {}) {
  const httpSupport = createHttpSupport();
  const identity = createIdentityService({ config, sharedAuthStore });
  const files = createLearnFileStore({ config, logger, paths });
  const accounts = createAccountStore({ config, files });
  const learnData = createLearnDataStore({ files });
  const sessions = createSessionStore({ config, files, identity, logger, sharedAuthStore });
  const content = createContentService({ config, files, logger });
  const auth = createAuthService({
    accounts,
    config,
    fetchImpl,
    httpSupport,
    identity,
    learnData,
    sessions,
    sharedAuthStore,
  });
  const profileRoutes = createProfileRoutes({ auth, files, httpSupport, learnData });
  const adminRoutes = createAdminRoutes({
    accounts,
    auth,
    content,
    files,
    httpSupport,
    identity,
    sharedAuthStore,
  });
  const staticService = createStaticService({ config, httpSupport });

  async function initialize() {
    await sessions.readPersistedSessions();
    await accounts.readPersistedAccounts();
    await learnData.readPersistedUserData();
    await accounts.seedBootstrapAccounts();
  }

  return {
    httpSupport,
    identity,
    files,
    accounts,
    learnData,
    sessions,
    content,
    auth,
    profileRoutes,
    adminRoutes,
    staticService,
    initialize,
  };
}
