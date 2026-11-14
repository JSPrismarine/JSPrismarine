import { gzipSync } from 'node:zlib';

import type { StatsSnapshot } from '../StatsRegistry';
import type { BStatsChart } from './charts';
import { encodeCharts } from './charts';
import { bstatsOs } from './os';
import { BSTATS_ENDPOINT, BSTATS_METRICS_VERSION, BSTATS_SERVICE_ID } from './service';

/** The JSON body of one bStats submit, before compression. */
export interface BStatsPayload {
    /** The OS name as Java's `os.name` gives it, from {@link bstatsOs}. */
    readonly osName: string;
    /** From the snapshot's `platform.arch`. */
    readonly osArch: string;
    /** The OS version as Java's `os.version` gives it, from {@link bstatsOs}. */
    readonly osVersion: string;
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
 * @param serverUuid - The server's `server-uuid`, sent as `serverUUID`.
 * @returns The payload, ready for {@link buildRequest}.
 * @throws {Error} When a chart in the table maps onto a bStats default chart ID.
 */
export const buildPayload = (snapshot: StatsSnapshot, serverUuid: string): BStatsPayload => {
    const { osName, osVersion } = bstatsOs(snapshot.platform);
    return {
        osName,
        osArch: snapshot.platform.arch,
        osVersion,
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
 * Builds the submit request for a payload: a POST to {@link BSTATS_ENDPOINT} with the payload as
 * gzip-compressed JSON. The caller adds an abort signal for its timeout.
 * @param payload - The payload from {@link buildPayload}.
 * @returns The URL and the `fetch` options.
 */
export const buildRequest = (payload: BStatsPayload): BStatsRequest => ({
    url: BSTATS_ENDPOINT,
    init: { method: 'POST', headers: BSTATS_HEADERS, body: gzipSync(JSON.stringify(payload)), redirect: 'error' }
});
