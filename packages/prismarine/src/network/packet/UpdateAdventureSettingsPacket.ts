import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

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
    public static NetID = Identifiers.UpdateAdventureSettingsPacket;

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
        this.writeBoolean(this.noAttackingMobs);
        this.writeBoolean(this.noAttackingPlayers);
        this.writeBoolean(this.worldImmutable);
        this.writeBoolean(this.showNameTags);
        this.writeBoolean(this.autoJump);
    }

    /** Reads the five settings in docs order. */
    public decodePayload(): void {
        this.noAttackingMobs = this.readBoolean();
        this.noAttackingPlayers = this.readBoolean();
        this.worldImmutable = this.readBoolean();
        this.showNameTags = this.readBoolean();
        this.autoJump = this.readBoolean();
    }
}
