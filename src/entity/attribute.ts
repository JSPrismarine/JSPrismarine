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
    constructor(
        name: string,
        min: number,
        max: number,
        def: number,
        value: number
    ) {
        this.name = name;
        this.min = min;
        this.max = max;
        this.default = def;
        this.value = value;
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
            new Attribute(AttributeIds.Absorption, 0, MAX_FLOAT32, 0, 0),
            new Attribute(AttributeIds.PlayerSaturation, 0, 20, 20, 20),
            new Attribute(AttributeIds.PlayerExhaustion, 0, 5, 0, 0),
            new Attribute(AttributeIds.KnockbackResistence, 0, 1, 0, 0),
            new Attribute(AttributeIds.Health, 0, 20, 20, 20),
            new Attribute(AttributeIds.Movement, 0, MAX_FLOAT32, 0.1, 0.1),
            new Attribute(AttributeIds.FollowRange, 0, 2048, 16, 16),
            new Attribute(AttributeIds.PlayerHunger, 0, 20, 20, 20),
            new Attribute(AttributeIds.AttackDamage, 0, MAX_FLOAT32, 1, 1),
            new Attribute(AttributeIds.PlayerLevel, 0, 24791, 0, 0),
            new Attribute(AttributeIds.PlayerExperience, 0, 1, 0, 0),
            new Attribute(
                AttributeIds.UnderwaterMovement,
                0,
                MAX_FLOAT32,
                0.02,
                0.02
            ),
            new Attribute(AttributeIds.Luck, -1024, 1024, 0, 0),
            new Attribute(AttributeIds.FallDamage, 0, MAX_FLOAT32, 1, 1),
            new Attribute(AttributeIds.HorseJumpStrength, 0, 2, 0.7, 0.7),
            new Attribute(AttributeIds.ZombieSpawnReinforcements, 0, 1, 0, 0),
            new Attribute(AttributeIds.LavaMovement, 0, MAX_FLOAT32, 0.02, 0.02)
        ];
    }

    public getAttributes(): Attribute[] {
        return this.attributes;
    }
}
