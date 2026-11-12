import { gzipSync } from 'node:zlib';

import type { StatsSnapshot } from '../StatsRegistry';
import type { BStatsChart } from './charts';
import { encodeCharts } from './charts';
import { BSTATS_METRICS_VERSION, BSTATS_SERVICE_ID } from './service';

/** The JSON body of one bStats submit, before compression. */
export interface BStatsPayload {
    /**
     * The snapshot's `platform.type`, as `os.type()` gives it. bStats maps this and the next two
     * fields into its OS chart, in the form Java's `os.name` and `os.version` take there.
     */
    readonly nodeOsType: string;
    /** The snapshot's `platform.release`, as `os.release()` gives it. */
    readonly nodeOsRelease: string;
    /** The snapshot's `platform.version`, as `os.version()` gives it. */
    readonly nodeOsVersion: string;
    /** From the snapshot's `platform.arch`. */
    readonly osArch: string;
    readonly coreCount: number;
    readonly serverUUID: string;
    readonly metricsVersion: string;
    readonly service: {
        readonly id: number;
        readonly customCharts: readonly BStatsChart[];
    };
}

/**
 * Builds the bStats payload for a snapshot: the platform fields at the top level, then the
 * server UUID, the metrics version and the service with its custom charts.
 * @param snapshot - The registry's snapshot.
 * @param serverUuid - The server's UUID, sent as `serverUUID`.
 * @returns The payload, ready for {@link buildRequest}.
 * @throws {Error} When a chart in the table maps onto a bStats default chart ID.
 */
export const buildPayload = (snapshot: StatsSnapshot, serverUuid: string): BStatsPayload => {
    return {
        nodeOsType: snapshot.platform.type,
        nodeOsRelease: snapshot.platform.release,
        nodeOsVersion: snapshot.platform.version,
        osArch: snapshot.platform.arch,
        coreCount: snapshot.platform.coreCount,
        serverUUID: serverUuid,
        metricsVersion: BSTATS_METRICS_VERSION,
        service: { id: BSTATS_SERVICE_ID, customCharts: encodeCharts(snapshot) }
    };
};

/**
 * The headers bStats' own clients send. `fetch` adds `Content-Length` from the body.
 */
export const BSTATS_HEADERS = {
    Accept: 'application/json',
    Connection: 'close',
    'Content-Encoding': 'gzip',
    'Content-Type': 'application/json',
    'User-Agent': 'Metrics-Service/1'
} as const;

/** The `fetch` options of a submit. */
export interface BStatsRequestInit extends RequestInit {
    readonly method: 'POST';
    readonly headers: typeof BSTATS_HEADERS;
    /** The payload as gzip-compressed JSON. */
    readonly body: Uint8Array<ArrayBuffer>;
    /** A redirect fails the submit, so the payload never follows one to another address. */
    readonly redirect: 'error';
}

/** One submit, for `fetch(request.url, request.init)`. */
export interface BStatsRequest {
    readonly url: string;
    readonly init: BStatsRequestInit;
}

/**
 * Builds the submit request for a payload: a POST to `endpoint` with the payload as
 * gzip-compressed JSON. The caller adds an abort signal for its timeout.
 * @param payload - The payload from {@link buildPayload}.
 * @param endpoint - The URL to post to, from `stats.bstats.endpoint`: bStats' own,
 * `BSTATS_ENDPOINT` in `service.ts`, by default.
 * @returns The URL and the `fetch` options.
 */
export const buildRequest = (payload: BStatsPayload, endpoint: string): BStatsRequest => ({
    url: endpoint,
    init: { method: 'POST', headers: BSTATS_HEADERS, body: gzipSync(JSON.stringify(payload)), redirect: 'error' }
});
