import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

/** Nothing. The packet arriving at all is the whole message. */
export type RefreshEntitlements = Record<string, never>;

/**
 * Asks the server to re-read the player's entitlements, the marketplace purchases and
 * subscriptions tied to the account.
 *
 * Protocol 2193 layout: the packet header and no payload. The docs describe it only as
 * "Refresh Entitlements"; gophertunnel treats it as serverbound. A dedicated server that
 * does not gate content on entitlements can ignore it.
 */
export default class RefreshEntitlementsPacket extends NetworkPacket<RefreshEntitlements> {
    public get id(): number {
        return PacketIdentifier.REFRESH_ENTITLEMENTS;
    }

    protected serializePayload(): void {
        // Deliberately empty.
    }

    protected deserializePayload(): RefreshEntitlements {
        return {};
    }
}
