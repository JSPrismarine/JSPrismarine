import { randomBytes } from 'node:crypto';

import { encodeLanAdvertisement, lanAdvertisementOf } from '@jsprismarine/nethernet';

import type { ServerStatus } from '../ServerStatus';
import { netherNetStatusOf } from './netherNetStatusOf';

/** Where the advertisement goes: the NetherNet server, which answers discovery requests with it. */
export interface LanAdvertisementTarget {
    setAdvertisement(buffer: Buffer): void;
}

/** A nonce like the one Bedrock Dedicated Server advertises: 64 random bits in hex. */
export const lanNonce = (): string => randomBytes(8).readBigUInt64BE().toString(16);

/**
 * Keeps the LAN advertisement in step with the server status: sets it now and again whenever the
 * MOTD, names or player counts change.
 * @param target - The NetherNet server answering discovery.
 * @param status - The status every transport advertises.
 * @param onlineMode - Whether the server requires Xbox Live sign-in.
 * @param nonce - This server start's token.
 * @returns A function that stops following the status.
 */
export const advertiseOnLan = (
    target: LanAdvertisementTarget,
    status: Pick<ServerStatus, 'current' | 'onChange'>,
    onlineMode: boolean,
    nonce: string = lanNonce()
): (() => void) => {
    const advertise = () =>
        target.setAdvertisement(
            encodeLanAdvertisement(lanAdvertisementOf(netherNetStatusOf(status.current()), onlineMode, nonce))
        );
    advertise();
    return status.onChange(advertise);
};
