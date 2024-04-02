import type BinaryStream from '@jsprismarine/jsbinaryutils';
import McpeUtil from '../network/NetworkUtil';

export const AttributeIds = {
    Absorption: 'minecraft:absorption',
    PlayerSaturation: 'minecraft:player.saturation',
    PlayerExhaustion: 'minecraft:player.exhaustion',
    KnockbackResistence: 'minecraft:knockback_resistance',
    Health: 'minecraft:health',
    Movement: 'minecraft:movement',
    FollowRange: 'minecraft:follow_range',
    PlayerHunger: 'minecraft:player.hunger',
    AttackDamage: 'minecraft:attack_damage',
    PlayerLevel: 'minecraft:player.level',
    PlayerExperience: 'minecraft:player.experience',
    UnderwaterMovement: 'minecraft:underwater_movement',
    Luck: 'minecraft:luck',
    FallDamage: 'minecraft:fall_damage',
    HorseJumpStrength: 'minecraft:horse.jump_strength',
    ZombieSpawnReinforcements: 'minecraft:zombie.spawn_reinforcements',
    LavaMovement: 'minecraft:lava_movement'
};

export class Attribute {
    private readonly name: string;
    private readonly min: number;
    private readonly max: number;
    private readonly default: number;
    private readonly value: number;

    /**
     * Class used to store Attribute data.
     *
     * @param name - Attribute identifier
     * @param min - Attribute minimum value
     * @param max - Attribute maximum value
     * @param def - Attribute default value
     * @param value - Attribute current value
     */
    public constructor({
        name,
        min,
        max,
        def,
        value
    }: {
        name: string;
        min: number;
        max: number;
        def: number;
        value: number;
    }) {
        this.name = name;
        this.min = min;
        this.max = max;
        this.default = def;
        this.value = value;
    }

    public networkSerialize(stream: BinaryStream): void {
        stream.writeFloatLE(this.min);
        stream.writeFloatLE(this.max);
        stream.writeFloatLE(this.value);
        stream.writeFloatLE(this.default);
        McpeUtil.writeString(stream, this.name);
        stream.writeUnsignedVarInt(0); // TODO: modifier count
    }

    public static networkDeserialize(stream: BinaryStream): Attribute {
        const attr = new Attribute({
            min: stream.readFloatLE(),
            max: stream.readFloatLE(),
            value: stream.readFloatLE(),
            def: stream.readFloatLE(),
            name: McpeUtil.readString(stream)
        });
        stream.readUnsignedVarInt(); // TODO: skip for now
        return attr;
    }

    public getName(): string {
        return this.name;
    }

    public getMin(): number {
        return this.min;
    }

    public getMax(): number {
        return this.max;
    }

    public getDefault(): number {
        return this.default;
    }

    public getValue(): number {
        return this.value;
    }
}

const MAX_FLOAT32 = 3.4028234663852886e38;
export default class AttributeManager {
    private readonly attributes: Attribute[] = [];

    /**
     * Returns a list of default attributes to send the first time a player spawns.
     */
    public getDefaults() {
        return [
            new Attribute({
                name: AttributeIds.Absorption,
                min: 0,
                max: 16,
                def: 0,
                value: 0
            }),
            new Attribute({
                name: AttributeIds.PlayerSaturation,
                min: 0,
                max: 20,
                def: 5,
                value: 4
            }),
            new Attribute({
                name: AttributeIds.PlayerExhaustion,
                min: 0,
                max: 20,
                def: 0,
                value: 0
            }),
            new Attribute({
                name: AttributeIds.KnockbackResistence,
                min: 0,
                max: 1,
                def: 0,
                value: 0
            }),
            new Attribute({
                name: AttributeIds.Health,
                min: 0,
                max: 20,
                def: 20,
                value: 20
            }),
            new Attribute({
                name: AttributeIds.Movement,
                min: 0,
                max: MAX_FLOAT32,
                def: 0.1,
                value: 0.1
            }),
            new Attribute({
                name: AttributeIds.FollowRange,
                min: 0,
                max: 2048,
                def: 16,
                value: 16
            }),
            new Attribute({
                name: AttributeIds.PlayerHunger,
                min: 0,
                max: 20,
                def: 20,
                value: 20
            }),
            new Attribute({
                name: AttributeIds.AttackDamage,
                min: 0,
                max: 1,
                def: 1,
                value: 1
            }),
            new Attribute({
                name: AttributeIds.PlayerLevel,
                min: 0,
                max: 24791,
                def: 0,
                value: 0
            }),
            new Attribute({
                name: AttributeIds.PlayerExperience,
                min: 0,
                max: 1,
                def: 0,
                value: 0
            }),
            new Attribute({
                name: AttributeIds.UnderwaterMovement,
                min: 0,
                max: MAX_FLOAT32,
                def: 0.02,
                value: 0.02
            }),
            new Attribute({
                name: AttributeIds.Luck,
                min: -1024,
                max: 1024,
                def: 0,
                value: 0
            }),
            new Attribute({
                name: AttributeIds.FallDamage,
                min: 0,
                max: MAX_FLOAT32,
                def: 1,
                value: 1
            }),
            new Attribute({
                name: AttributeIds.HorseJumpStrength,
                min: 0,
                max: 2,
                def: 0.7,
                value: 0.7
            }),
            new Attribute({
                name: AttributeIds.ZombieSpawnReinforcements,
                min: 0,
                max: 1,
                def: 0,
                value: 0
            }),
            new Attribute({
                name: AttributeIds.LavaMovement,
                min: 0,
                max: MAX_FLOAT32,
                def: 0.02,
                value: 0.02
            })
        ];
    }

    public getAttributes(): Attribute[] {
        return this.attributes;
    }

    public networkSerialize(): void {}
}
