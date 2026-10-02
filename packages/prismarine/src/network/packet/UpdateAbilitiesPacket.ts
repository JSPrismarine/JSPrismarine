import { AbilityLayerFlag } from '@jsprismarine/minecraft';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import type PermissionType from '../type/PermissionType';
import type PlayerPermissionType from '../type/PlayerPermissionType';

export enum AbilityLayerType {
    CACHE,
    BASE,
    SPECTATOR,
    COMMANDS,
    EDITOR
}

// `AbilityLayerFlag` is generated from Mojang's documentation, where it is `AbilitiesIndex`.
export { AbilityLayerFlag };

export class AbilityLayer {
    public layerType!: AbilityLayerType;
    public layerFlags!: Map<AbilityLayerFlag, boolean>;

    public flySpeed!: number;
    /**
     * How fast the player climbs and descends while flying.
     *
     * Added at 2168, between the other two rather than after them - a layer that writes only
     * the horizontal speeds is four bytes short, and the client rejects the whole packet
     * rather than the layer.
     */
    public verticalFlySpeed = 1;
    public walkSpeed!: number;

    public getEncodedFlags(): { flagsHash: number; valuesHash: number } {
        let [flagsHash, valuesHash] = [0, 0];
        for (const [flag, value] of this.layerFlags.entries()) {
            flagsHash |= 1 << flag;
            // TODO: find a better solution, may work for now but i don't like this hack
            if (
                [AbilityLayerFlag.WALK_SPEED, AbilityLayerFlag.FLY_SPEED, AbilityLayerFlag.VERTICAL_FLY_SPEED].includes(
                    flag
                )
            ) {
                continue;
            }
            valuesHash |= value ? 1 << flag : 0;
        }
        return { flagsHash, valuesHash };
    }
}

export default class UpdateAbilitiesPacket extends DataPacket {
    public static NetID = Identifiers.UpdateAbilitiesPacket;

    public commandPermission!: PermissionType;
    public playerPermission!: PlayerPermissionType;
    public targetActorUniqueId!: bigint;
    public abilityLayers!: AbilityLayer[];

    public encodePayload(): void {
        this.writeLongLE(this.targetActorUniqueId);
        this.writeByte(this.playerPermission);
        this.writeByte(this.commandPermission);

        this.writeByte(this.abilityLayers.length);
        for (const abilityLayer of this.abilityLayers) {
            this.writeShortLE(abilityLayer.layerType);
            const encodedFlags = abilityLayer.getEncodedFlags();
            this.writeIntLE(encodedFlags.flagsHash);
            this.writeIntLE(encodedFlags.valuesHash);
            this.writeFloatLE(abilityLayer.flySpeed);
            this.writeFloatLE(abilityLayer.verticalFlySpeed);
            this.writeFloatLE(abilityLayer.walkSpeed);
        }
    }

    public decodePayload(): void {
        this.targetActorUniqueId = this.readLongLE();
        this.playerPermission = this.readByte();
        this.commandPermission = this.readByte();

        const len = this.readByte();
        for (let i = 0; i < len; i++) {
            // TODO: decode abilities
        }
    }
}
