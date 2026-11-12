import { familyOf, isPublicAddress } from './addresses';

/**
 * Free services that answer a plain-text request with the caller's public IPv4 address, in the
 * order {@link lookupPublicIp} asks them. Several, so one being down or rate limited costs nothing.
 * Each answers over IPv4 only, so the address is of the family most host candidates are.
 */
export const PUBLIC_IP_SERVICES = [
    'https://api.ipify.org',
    'https://ipv4.icanhazip.com',
    'https://checkip.amazonaws.com',
    'https://v4.ident.me'
] as const;

/** How long each service may take to answer before the next is asked. */
const DEFAULT_TIMEOUT_MS = 3_000;

/** The longest answer read as an address; an IPv4 literal is 15 characters. */
const MAX_ANSWER_LENGTH = 64;

/** What {@link lookupPublicIp} asks, and how. */
export interface PublicIpLookupOptions {
    /** The services to ask, in order; {@link PUBLIC_IP_SERVICES} when absent. */
    readonly services?: readonly string[];
    /** Sends a request; the global `fetch` when absent. */
    readonly fetch?: (url: string, init: { readonly signal: AbortSignal }) => Promise<Response>;
    /** How long each service may take, in milliseconds. */
    readonly timeoutMs?: number;
    /** Stops the lookup, such as when the server stops first. */
    readonly signal?: AbortSignal;
}

/** What {@link lookupPublicIp} found: the address and the service that named it, or why every service failed. */
export type PublicIpLookupResult =
    { readonly address: string; readonly service: string } | { readonly failures: readonly string[] };

/**
 * Asks each service in turn for this host's public address, and returns the first that answers
 * with a public IP literal. A service that fails, times out, or answers with anything else is
 * skipped, and its reason kept for the log.
 * @param options - The services, the transport and the timeout.
 * @returns The address and its service, or one failure per service asked.
 */
export const lookupPublicIp = async (options: PublicIpLookupOptions = {}): Promise<PublicIpLookupResult> => {
    const send = options.fetch ?? fetch;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const failures: string[] = [];
    for (const service of options.services ?? PUBLIC_IP_SERVICES) {
        if (options.signal?.aborted === true) break;
        const timeout = AbortSignal.timeout(timeoutMs);
        const signal = options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout]);
        try {
            const response = await send(service, { signal });
            if (!response.ok) {
                failures.push(`${service} answered HTTP ${response.status}`);
                continue;
            }
            const answer = (await response.text()).trim();
            if (answer.length <= MAX_ANSWER_LENGTH && familyOf(answer) !== undefined && isPublicAddress(answer)) {
                return { address: answer, service };
            }
            failures.push(`${service} answered no public IP address`);
        } catch (error: unknown) {
            failures.push(
                `${service} ${timeout.aborted ? `did not answer within ${timeoutMs} ms` : `failed: ${error instanceof Error ? error.message : String(error)}`}`
            );
        }
    }
    return { failures };
};
