import { randomBytes } from 'node:crypto';

import type { ServerName } from '@jsprismarine/raknet';
import { encodeLanAdvertisement, lanAdvertisementOf } from '@jsprismarine/nethernet';
import { netherNetStatusOf } from './netherNetStatusOf';

/** Where the advertisement goes: the NetherNet server, which answers discovery requests with it. */
export interface LanAdvertisementTarget {
    setAdvertisement(buffer: Buffer): void;
}

/** A nonce like the one Bedrock Dedicated Server advertises: 64 random bits in hex. */
export const lanNonce = (): string => randomBytes(8).readBigUInt64BE().toString(16);

/**
 * Keeps the LAN advertisement in step with the server name: sets it now and again whenever the
 * MOTD, version or player counts change.
 * @param target - The NetherNet server answering discovery.
 * @param serverName - The status every transport advertises.
 * @param onlineMode - Whether the server requires Xbox Live sign-in.
 * @param nonce - This server start's token.
 * @returns A function that stops following the server name.
 */
export const advertiseOnLan = (
    target: LanAdvertisementTarget,
    serverName: ServerName,
    onlineMode: boolean,
    nonce: string = lanNonce()
): (() => void) => {
    const advertise = () =>
        target.setAdvertisement(
            encodeLanAdvertisement(lanAdvertisementOf(netherNetStatusOf(serverName.getSnapshot()), onlineMode, nonce))
        );
    advertise();
    return serverName.onChange(advertise);
};
