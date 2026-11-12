/** The service's name on bstats.org. */
export const BSTATS_SERVICE_NAME = 'JSPrismarine';

/** The service ID bstats.org assigned to {@link BSTATS_SERVICE_NAME}, sent as `service.id`. */
export const BSTATS_SERVICE_ID = 35257;

/** The `metricsVersion` field of every payload, the version of this bStats client. */
export const BSTATS_METRICS_VERSION = '0.1.0';

/** The bStats platform the server reports as. bStats names the endpoint after it. */
export const BSTATS_PLATFORM = 'server-implementation';

/** Where a payload is posted. */
export const BSTATS_ENDPOINT = `https://bStats.org/api/v2/data/${BSTATS_PLATFORM}`;
