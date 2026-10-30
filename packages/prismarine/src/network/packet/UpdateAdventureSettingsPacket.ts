import { layoutAt, updateAdventureSettingsPacket } from '@jsprismarine/protocol';

import DataPacket from './DataPacket';

/**
 * Replaces the client's `AdventureSettings`.
 *
 * The half of the old `AdventureSettingsPacket` that is not abilities; `UpdateAbilitiesPacket`
 * carries the rest. Wire order at protocol 2193 is five booleans, one byte each: `no PvM`,
 * `no MvP`, `Immutable World`, `Show Name Tags`, `Auto Jump`.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-adventure-settings-packet/
 */
export default class UpdateAdventureSettingsPacket extends DataPacket {
    /** `no PvM`: the player may not attack mobs. */
    public noAttackingMobs!: boolean;

    /** `no MvP`: mobs may not attack the player. */
    public noAttackingPlayers!: boolean;

    /** `Immutable World`: the player may not place or break anything. */
    public worldImmutable!: boolean;

    /** `Show Name Tags`: whether name tags are drawn above players. */
    public showNameTags!: boolean;

    /** `Auto Jump`: whether the client steps up blocks by itself. */
    public autoJump!: boolean;

    /** Writes the five settings in docs order. */
    public encodePayload(): void {
        layoutAt(updateAdventureSettingsPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads the five settings in docs order. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(updateAdventureSettingsPacket, this.codecProtocol).decode(this));
    }
}
