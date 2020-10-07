'use strict';

const AttributeIds = {
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
class Attribute {
    /** @type {string} */
    name
    /** @type {number} */
    min
    /** @type {number} */
    max
    /** @type {number} */
    default
    /** @type {number} */
    value

    /**
     * Class used to store Attribute data.
     * 
     * @param {string} name - Attribute identifier
     * @param {number} min - Attribute minimum value
     * @param {number} max - Attribute maximum value
     * @param {number} def - Attribute default value
     * @param {number} value - Attribute current value
     */
    constructor(name, min, max, def, value) {
        this.name = name;
        this.min = min;
        this.max = max;
        this.default = def;
        this.value = value;
    }
}
const MAX_FLOAT32 = 3.4028234663852886e+38;
class AttributeManager {
    /** @type {Attribute[]} */
    #attributes = []

    /**
     * Returns a list of default attributes to send the first time a player spawns.
     */
    getDefaults() {
        return [
            new Attribute(AttributeIds.Absorption, 0.00, MAX_FLOAT32, 0.00, 0.00),
            new Attribute(AttributeIds.PlayerSaturation, 0.00, 20.00, 20.00, 20.00),
            new Attribute(AttributeIds.PlayerExhaustion, 0.00, 5.00, 0.00, 0.00),
            new Attribute(AttributeIds.KnockbackResistence, 0.00, 1.00, 0.00, 0.00),
            new Attribute(AttributeIds.Health, 0.00, 20.00, 20.00, 20.00),
            new Attribute(AttributeIds.Movement, 0.00, MAX_FLOAT32, 0.10, 0.10),
            new Attribute(AttributeIds.FollowRange, 0.00, 2048.00, 16.00, 16.00),
            new Attribute(AttributeIds.PlayerHunger, 0.00, 20.00, 20.00, 20.00),
            new Attribute(AttributeIds.AttackDamage, 0.00, MAX_FLOAT32, 1.0, 1.0),
            new Attribute(AttributeIds.PlayerLevel, 0.00, 24791.00, 0.00, 0.00),
            new Attribute(AttributeIds.PlayerExperience, 0.00, 1.00, 0.00, 0.00),
            new Attribute(AttributeIds.UnderwaterMovement, 0.0, MAX_FLOAT32, 0.02, 0.02),
            new Attribute(AttributeIds.Luck, -1024.0, 1024.0, 0.0, 0.0),
            new Attribute(AttributeIds.FallDamage, 0.0, MAX_FLOAT32, 1.0, 1.0),
            new Attribute(AttributeIds.HorseJumpStrength, 0.0, 2.0, 0.7, 0.7),
            new Attribute(AttributeIds.ZombieSpawnReinforcements, 0.0, 1.0, 0.0, 0.0),
            new Attribute(AttributeIds.LavaMovement, 0.0, MAX_FLOAT32, 0.02, 0.02)
        ];
    }

    getAttributes() {
        return this.#attributes;
    }

    /* setAttribute(id, ) {

    } */
}
module.exports = { AttributeIds, Attribute, AttributeManager };