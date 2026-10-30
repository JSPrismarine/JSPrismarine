import { layoutAt, resourcePacksInfoPacket } from '@jsprismarine/protocol';

import DataPacket from './DataPacket';

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
export default class ResourcePacksInfoPacket extends DataPacket {
    public resourcePackRequired!: boolean;
    public hasAddonPacks!: boolean;
    public hasScripts!: boolean;
    /** Turns deferred rendering off for the session, whatever the client would prefer. */
    public forceDisableVibrantVisuals = false;
    /** The template this world came from. All zeroes and an empty version when it came from none. */
    public worldTemplate: PackIdVersion = { uuidMostSignificant: 0n, uuidLeastSignificant: 0n, version: '' };
    public resourcePackEntries: ResourcePackEntry[] = [];

    public decodePayload(): void {
        Object.assign(this, layoutAt(resourcePacksInfoPacket, this.codecProtocol).decode(this));
    }

    public encodePayload(): void {
        layoutAt(resourcePacksInfoPacket, this.codecProtocol).encode(this, this);
    }
}
