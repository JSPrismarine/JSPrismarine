import { layoutAt, resourcePacksInfoPacket } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

import type { PackIdVersion, ResourcePackEntry } from '@jsprismarine/protocol';

export type { PackIdVersion, ResourcePackEntry };

/**
 * Tells the client which resource packs it has to download before joining.
 *
 * The wire layout is the `resourcePacksInfoPacket` definition in `@jsprismarine/protocol`:
 * the four flag bytes, the `World Template Id And Version`, then the `Resource Packs` list.
 * The fourth flag and the world template arrived at 2168; a reader without them takes the
 * flag for the start of the template and drops the connection.
 */
export default class ResourcePacksInfoPacket extends FieldNetworkPacket {
    public resourcePackRequired!: boolean;
    public hasAddonPacks!: boolean;
    public hasScripts!: boolean;
    /** Turns deferred rendering off for the session, whatever the client would prefer. */
    public forceDisableVibrantVisuals = false;
    /** The template this world came from. All zeroes and an empty version when it came from none. */
    public worldTemplate: PackIdVersion = { uuidMostSignificant: 0n, uuidLeastSignificant: 0n, version: '' };
    public resourcePackEntries: ResourcePackEntry[] = [];

    /** Reads the layout's fields straight onto the packet, replacing any entries it held. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(resourcePacksInfoPacket, this.codecProtocol).decode(this));
    }

    /** Writes the packet's fields through the layout; their names match the field list. */
    public encodePayload(): void {
        layoutAt(resourcePacksInfoPacket, this.codecProtocol).encode(this, this);
    }
}
