import { parseOptionalBoolean } from "../../../shared/valueUtils.js";
import { createAdminAuthorizationMiddleware } from "./adminAuth/authorizationMiddleware.js";
import { disableAdminApiCache, disableApiCache, rejectMissingStaticAsset } from "./adminAuth/cacheMiddleware.js";
import { createAdminMutationOriginGuard } from "./adminAuth/mutationOrigin.js";
import { createAdminRequestContext } from "./adminAuth/requestContext.js";
import { createAdminSessionContext } from "./adminAuth/sessionContext.js";

function createAdminAuth({ repository, ubisoftAuth, sharedAuthStore, config }) {
  const requestContext = createAdminRequestContext({ ubisoftAuth, sharedAuthStore, config });
  const sessionContext = createAdminSessionContext({
    repository,
    ubisoftAuth,
    sharedAuthStore,
    config,
    requestContext,
  });
  const authorizationMiddleware = createAdminAuthorizationMiddleware({
    ubisoftAuth,
    sharedAuthStore,
    config,
    requestContext,
    sessionContext,
  });
  const requireAdminMutationOrigin = createAdminMutationOriginGuard(requestContext);

  return {
    getHeaderAdminToken: requestContext.getHeaderAdminToken,
    getInternalServiceToken: requestContext.getInternalServiceToken,
    tokensMatch: requestContext.tokensMatch,
    isConfiguredAdminToken: requestContext.isConfiguredAdminToken,
    getStaticAdminSession: requestContext.getStaticAdminSession,
    parseOptionalBoolean,
    getOAuthLoginUrl: requestContext.getOAuthLoginUrl,
    buildSharedLogoutCookie: requestContext.buildSharedLogoutCookie,
    isOAuthEnforced: sessionContext.isOAuthEnforced,
    isLocalRequest: requestContext.isLocalRequest,
    getSharedAdminContext: sessionContext.getSharedAdminContext,
    isTrustedServiceAdminRequest: requestContext.isTrustedServiceAdminRequest,
    isOAuthFallbackOpen: sessionContext.isOAuthFallbackOpen,
    isOAuthRequiredButUnavailable: sessionContext.isOAuthRequiredButUnavailable,
    requirePageAdmin: authorizationMiddleware.requirePageAdmin,
    requireApiAdmin: authorizationMiddleware.requireApiAdmin,
    requireAdminMutationOrigin,
    disableAdminApiCache,
    disableApiCache,
    rejectMissingStaticAsset,
    resolveLiveAuthContext: sessionContext.resolveLiveAuthContext,
  };
}

export { createAdminAuth };
