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

export enum AbilityLayerFlag {
    BUILD,
    MINE,
    DOORS_AND_SWITCHES,
    OPEN_CONTAINERS,
    ATTACK_PLAYERS,
    ATTACK_MOBS,
    OPERATOR_COMMANDS,
    TELEPORT,
    INVULNERABLE,
    FLYING,
    MAY_FLY,
    INSTABUILD,
    LIGHTNING,
    FLY_SPEED,
    WALK_SPEED,
    MUTED,
    WORLD_BUILDER,
    NO_CLIP,
    PRIVILEGED_BUILDER
}

export class AbilityLayer {
    public layerType!: AbilityLayerType;
    public layerFlags!: Map<AbilityLayerFlag, boolean>;

    public flySpeed!: number;
    public walkSpeed!: number;

    public getEncodedFlags(): { flagsHash: number; valuesHash: number } {
        let [flagsHash, valuesHash] = [0, 0];
        for (const [flag, value] of this.layerFlags.entries()) {
            flagsHash |= 1 << flag;
            // TODO: find a better solution, may work for now but i don't like this hack
            if ([AbilityLayerFlag.WALK_SPEED, AbilityLayerFlag.FLY_SPEED].includes(flag)) {
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
