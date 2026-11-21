import { lookupPublicIp } from '@jsprismarine/nethernet';
import type { PublicIpLookupOptions } from '@jsprismarine/nethernet';

/** Where the fallback reports what it found. */
export interface PublicIpFallbackLogger {
    info(message: string): void;
    warn(message: string): void;
}

/**
 * The server's public address as a few web services report it, for a client that reached no
 * address in its last answer. It is looked up once, the first time it is asked for, and never
 * replaces `server-public-ip`: the answer offers it beside the configured address. It logs what it
 * finds, and warns when it finds nothing or finds another address than the configured one.
 * @param configured - The address `server-public-ip` names, when it names one.
 * @param logger - Where the result goes.
 * @param options - The services, transport and abort signal, as {@link lookupPublicIp} takes them.
 * @returns Looks the address up, or gives the one found; undefined when nothing answered.
 */
export const publicIpFallback = (
    configured: string | undefined,
    logger: PublicIpFallbackLogger,
    options: PublicIpLookupOptions = {}
): (() => Promise<string | undefined>) => {
    let found: Promise<string | undefined> | undefined;
    return () => {
        found ??= lookupPublicIp(options).then((result) => {
            if (options.signal?.aborted === true) return undefined;
            if ('address' in result) {
                if (configured !== undefined && configured !== result.address) {
                    logger.warn(
                        `A player could not reach this server at server-public-ip ${configured}. ${result.service} reports its public address as ${result.address}, which NetherNet now offers beside it to a player whose last join failed. Set server-public-ip to the address players reach this server at.`
                    );
                } else {
                    logger.info(
                        `A player reached none of the addresses NetherNet offered, so it now also offers ${result.address}, the public address ${result.service} reported, to a player whose last join failed. Set server-public-ip to choose the address.`
                    );
                }
                return result.address;
            }
            logger.warn(
                `A player reached none of the addresses NetherNet offered, and NetherNet could not look up this server's public address (${result.failures.join('; ')}). Set server-public-ip to the address players reach this server at, or enable-server-public-ip-lookup to false to stop looking it up.`
            );
            return undefined;
        });
        return found;
    };
};
