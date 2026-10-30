import { AbilityLayerFlag, CommandPermissionLevel, PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { updateAbilitiesPacket } from '../wire/definitions/updateAbilities';
import { layoutAt } from '../wire/WireLayout';
import SerializedAbilityLayer from '../structure/SerializedAbilityLayer';
import FieldNetworkPacket from '../FieldNetworkPacket';

/**
 * The "SerializedLayer" value of an ability layer, written as a uint16.
 *
 * The client merges layers in this order, so a flag set in a later layer wins over the same
 * flag in an earlier one. The docs type the field as a bare uint16; the values are the
 * client's `AbilitiesLayer` enum, `CustomCache` through `LoadingScreen`.
 */
export enum AbilityLayerType {
    CACHE,
    BASE,
    SPECTATOR,
    COMMANDS,
    EDITOR,
    LOADING_SCREEN
}

// `AbilityLayerFlag` is generated from Mojang's documentation, where it is `AbilitiesIndex`.
export { AbilityLayerFlag };

/**
 * Flags that mark a speed float as meaningful instead of carrying a boolean.
 *
 * The client reads the speed itself from "FlySpeed", "VerticalFlySpeed", or "WalkSpeed", so a
 * speed flag has no true or false of its own. Its bit goes into "AbilitiesSet" to say the
 * float applies, and its bit in "AbilityValues" stays clear.
 */
const SPEED_FLAGS: ReadonlySet<AbilityLayerFlag> = new Set([
    AbilityLayerFlag.FLY_SPEED,
    AbilityLayerFlag.VERTICAL_FLY_SPEED,
    AbilityLayerFlag.WALK_SPEED
]);

/** Number of bits in the "AbilitiesSet" and "AbilityValues" uint32 fields. */
const BITSET_WIDTH = 32;

/**
 * One "SerializedAbilitiesDataSerializedLayer" entry of an `UpdateAbilitiesPacket`.
 *
 * Wire order, all little-endian: "SerializedLayer" uint16, "AbilitiesSet" uint32,
 * "AbilityValues" uint32, "FlySpeed" float, "VerticalFlySpeed" float, "WalkSpeed" float.
 * `layerFlags` holds both bitsets. A flag present in the map is set in "AbilitiesSet", and
 * its boolean is the matching bit of "AbilityValues", except for the speed flags described
 * on `SPEED_FLAGS`.
 */
export class AbilityLayer {
    public layerType: AbilityLayerType = AbilityLayerType.BASE;
    public layerFlags: Map<AbilityLayerFlag, boolean> = new Map();

    public flySpeed = 0.05;
    /**
     * How fast the player climbs and descends while flying.
     *
     * Added at 2168, between the other two rather than after them. A layer that writes only
     * the horizontal speeds is four bytes short, and the client rejects the whole packet
     * rather than the layer.
     */
    public verticalFlySpeed = 1;
    public walkSpeed = 0.1;

    /**
     * Packs `layerFlags` into the two uint32 bitsets.
     *
     * @returns `flagsHash` is "AbilitiesSet" and `valuesHash` is "AbilityValues", both as
     * unsigned numbers so bit 31 does not come out negative.
     */
    public getEncodedFlags(): { flagsHash: number; valuesHash: number } {
        let [flagsHash, valuesHash] = [0, 0];
        for (const [flag, value] of this.layerFlags.entries()) {
            flagsHash |= 1 << flag;
            if (SPEED_FLAGS.has(flag)) continue;
            valuesHash |= value ? 1 << flag : 0;
        }
        return { flagsHash: flagsHash >>> 0, valuesHash: valuesHash >>> 0 };
    }

    /**
     * Rebuilds `layerFlags` from the two uint32 bitsets read off the wire.
     *
     * Every set bit of "AbilitiesSet" becomes a map entry. Its value is the matching bit of
     * "AbilityValues", or `true` for a speed flag since those carry no value bit. Bits above
     * `ABILITY_COUNT` are kept so a decoded layer encodes to the same bytes.
     */
    public setEncodedFlags(flagsHash: number, valuesHash: number): void {
        this.layerFlags = new Map();
        for (let flag = 0; flag < BITSET_WIDTH; flag++) {
            if (((flagsHash >>> flag) & 1) === 0) continue;
            const value = SPEED_FLAGS.has(flag) ? true : ((valuesHash >>> flag) & 1) === 1;
            this.layerFlags.set(flag, value);
        }
    }
}

/**
 * Server to client. Replaces a player's abilities with the layers in this packet.
 *
 * Payload is one "SerializedAbilitiesData": "Target Player Raw Id" int64 LE,
 * "Player Permissions" int8, "Command Permissions" uint8, then "Layers" as a varuint32 count
 * followed by that many `AbilityLayer` entries.
 *
 * The docs type "Player Permissions" as `PlayerPermissionLevel` and "Command Permissions" as
 * `CommandPermissionLevel`, the generated enums in `@jsprismarine/minecraft`. The target id
 * is the actor unique id the client got in `StartGamePacket` or `AddPlayerPacket`; a packet
 * for an id the client does not know is dropped.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-abilities-packet/
 */
export default class UpdateAbilitiesPacket extends FieldNetworkPacket {
    public commandPermission: CommandPermissionLevel = CommandPermissionLevel.ANY;
    public playerPermission: PlayerPermissionLevel = PlayerPermissionLevel.VISITOR;
    public targetActorUniqueId = 0n;
    public abilityLayers: AbilityLayer[] = [];

    /** Encodes the permission bytes and converts each ability layer to its bitset form. */
    public encodePayload(): void {
        layoutAt(updateAbilitiesPacket, this.codecProtocol).encode(this, {
            targetActorUniqueId: this.targetActorUniqueId,
            playerPermission: this.playerPermission,
            commandPermission: this.commandPermission,
            abilityLayers: this.abilityLayers.map((layer) => {
                const { flagsHash, valuesHash } = layer.getEncodedFlags();
                return new SerializedAbilityLayer(
                    layer.layerType,
                    flagsHash,
                    valuesHash,
                    layer.flySpeed,
                    layer.verticalFlySpeed,
                    layer.walkSpeed
                );
            })
        });
    }

    /** Reads permission bytes and expands each serialized layer into its ability flags. */
    public decodePayload(): void {
        const read = layoutAt(updateAbilitiesPacket, this.codecProtocol).decode(this);
        this.targetActorUniqueId = read.targetActorUniqueId;
        this.playerPermission = read.playerPermission;
        this.commandPermission = read.commandPermission;
        this.abilityLayers = read.abilityLayers.map((serialized) => {
            const layer = new AbilityLayer();
            layer.layerType = serialized.layer;
            layer.setEncodedFlags(serialized.abilitiesSet, serialized.abilityValues);
            layer.flySpeed = serialized.flySpeed;
            layer.verticalFlySpeed = serialized.verticalFlySpeed;
            layer.walkSpeed = serialized.walkSpeed;
            return layer;
        });
    }
}
