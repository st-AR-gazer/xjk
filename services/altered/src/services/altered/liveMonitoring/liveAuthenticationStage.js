import { clampInt, parseOptionalBoolean } from "../serviceSupport.js";

class LiveAuthenticationStage {
  constructor({ liveClient, liveMonitor }) {
    this.liveClient = liveClient;
    this.liveMonitor = liveMonitor;
  }

  async resolveLiveClient(options = {}) {
    const baseClient = this.liveClient;
    if (!baseClient) {
      return { error: "Live client is not initialized." };
    }

    if (baseClient.isConfigured()) {
      return {
        liveClient: baseClient,
        authSource: "service-config",
      };
    }

    const ubisoftAccessToken = String(options?.authContext?.ubisoftAccessToken || "").trim();
    if (ubisoftAccessToken) {
      try {
        const scopedClient = await baseClient.createUserScopedClient({ ubisoftAccessToken });
        return {
          liveClient: scopedClient,
          authSource: "ubisoft-session",
        };
      } catch (error) {
        const message = error?.message || "Failed to exchange Ubisoft session token for Nadeo access token.";
        return {
          error: `${message} Configure a service account for Live API calls using ALTERED_LIVE_DEDI_LOGIN and ALTERED_LIVE_DEDI_PASSWORD (or ALTERED_LIVE_ACCESS_TOKEN / ALTERED_LIVE_REFRESH_TOKEN).`,
        };
      }
    }

    return {
      error:
        "Live monitor is not configured. Provide ALTERED_LIVE auth variables (dedi credentials or access token), or sign in with Ubisoft OAuth.",
    };
  }

  async resolveCoreMapClient(options = {}) {
    const baseClient = this.liveClient;
    if (!baseClient) {
      return { error: "Live client is not initialized." };
    }

    if (baseClient.authMode === "basic" && baseClient.dediLogin && baseClient.dediPassword) {
      return {
        coreClient: baseClient.createSiblingClient({ audience: "NadeoServices" }),
        authSource: "service-config-basic",
      };
    }

    const ubisoftAccessToken = String(options?.authContext?.ubisoftAccessToken || "").trim();
    if (ubisoftAccessToken) {
      try {
        const scopedClient = await baseClient.createUserScopedClient({
          ubisoftAccessToken,
          audience: "NadeoServices",
        });
        return {
          coreClient: scopedClient,
          authSource: "ubisoft-session",
        };
      } catch (error) {
        return {
          error: error?.message || "Failed to exchange Ubisoft session token for a NadeoServices audience token.",
        };
      }
    }

    if (baseClient.defaultAudience === "NadeoServices" && baseClient.isConfigured()) {
      return {
        coreClient: baseClient,
        authSource: "service-config-token",
      };
    }

    return {
      error:
        "Official seasonal sync requires either service basic credentials or a Ubisoft session that can request the NadeoServices audience.",
    };
  }

  resolveLiveOptions(options = {}) {
    const activeOnly = parseOptionalBoolean(options.activeOnly);
    const fetchMapDetails = parseOptionalBoolean(options.fetchMapDetails);
    return {
      clubId: clampInt(options.clubId ?? this.liveMonitor.clubId, {
        min: 1,
        max: 2147483647,
        fallback: this.liveMonitor.clubId,
      }),
      activityPageSize: clampInt(
        options.activityPageSize ?? options.activityLength ?? this.liveMonitor.activityPageSize,
        { min: 1, max: 250, fallback: this.liveMonitor.activityPageSize }
      ),
      activeOnly: activeOnly ?? this.liveMonitor.activeOnly,
      fetchMapDetails: fetchMapDetails ?? this.liveMonitor.fetchMapDetails,
    };
  }
}

export { LiveAuthenticationStage };
