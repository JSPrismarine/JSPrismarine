import { layoutAt } from '@jsprismarine/protocol';
import { playerListPacket } from '@jsprismarine/protocol/wire/definitions/playerList';
import DataPacket from './DataPacket';

import type { PlayerListEntry } from '@jsprismarine/protocol/wire/structures/PlayerListEntry';

import type { PlayerListBody } from '@jsprismarine/protocol/wire/definitions/playerList';

/**
 * Re-export: the entry and its Action byte are wire structures and live in
 * `@jsprismarine/protocol`. This path stays so the server's importers keep working.
 */
export { PlayerListAction, PlayerListEntry } from '@jsprismarine/protocol/wire/structures/PlayerListEntry';
export type { PlayerListData } from '@jsprismarine/protocol/wire/structures/PlayerListEntry';

/**
 * Player List (packet 63). Adds players to or removes them from the client's player list.
 *
 * The payload is a varuint entry count followed by one entry per player. Each entry is a varuint
 * variant selector (1 for an Add entry, 0 for a Remove entry), the Action as a uint8, and the
 * UUID. An Add entry continues with the fields `PlayerListEntry.networkSerialize` writes. The
 * trusted-skin flag lives inside the skin, so nothing follows the entries.
 *
 * The wire layout lives in `playerList.wire.ts`'s declarative definition, which this class
 * walks at the protocol version stamped on it: which `SerializedSkin` layout the entries use
 * - and so where the PlayFab id sits - is the layout's decision, not this file's.
 */
export default class PlayerListPacket extends DataPacket {
    public entries: PlayerListEntry[] = [];
    public type!: number;

    /** The body under the key its 2193 shape travels as; the stamped version picks one. */
    public get bodyWithPlayFabIdInSkin(): PlayerListBody {
        return { type: this.type, entries: this.entries };
    }

    public set bodyWithPlayFabIdInSkin(value: PlayerListBody | null) {
        if (value === null) return;
        this.type = value.type;
        this.entries = value.entries;
    }

    /** The body under the key its 2225 shape travels as. */
    public get bodyWithPlayFabIdOnEntry(): PlayerListBody {
        return this.bodyWithPlayFabIdInSkin;
    }

    public set bodyWithPlayFabIdOnEntry(value: PlayerListBody | null) {
        this.bodyWithPlayFabIdInSkin = value;
    }

    /** Writes the entries through the layout the stamped protocol version resolves. */
    public encodePayload(): void {
        layoutAt(playerListPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads the entries back, the mirror of {@link encodePayload}. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(playerListPacket, this.codecProtocol).decode(this));
    }
}
