/**
 * How a boat or raft takes blows and breaks, transcribed from Java's `VehicleEntity`.
 *
 * Bedrock's `boat.json` and `chest_boat.json` declare no `minecraft:health` and their loot table
 * is empty: both editions break a boat in engine code. Java's `VehicleEntity.hurtServer` adds ten
 * times each blow to the vehicle's damage, and past 40 `destroy` removes it and drops its item,
 * which `AbstractBoat.getDropItem` names after the boat's own wood. `AbstractBoat.tick` takes a
 * point off the damage every tick, so a boat breaks under blows that come fast enough: five
 * punches in a row, or one sword swing.
 */

/** `VehicleEntity.hurtServer` adds the blow times this to the damage. */
export const VEHICLE_DAMAGE_PER_POINT = 10;

/** `VehicleEntity.hurtServer` destroys the vehicle once its damage is above this. */
export const VEHICLE_BREAK_DAMAGE = 40;

/** `AbstractBoat.tick` takes this much damage off every tick. */
export const VEHICLE_DAMAGE_DECAY_PER_TICK = 1;

/** The Bedrock entities this rule breaks, each with the item names of its boat and its raft. */
const BOAT_ITEMS: Readonly<Record<string, { readonly boat: string; readonly raft: string }>> = {
    'minecraft:boat': { boat: 'boat', raft: 'raft' },
    'minecraft:chest_boat': { boat: 'chest_boat', raft: 'chest_raft' }
};

/** The wood a boat without a variant is made of, as `EntityType.OAK_BOAT` is. */
const DEFAULT_WOOD = 'oak';

/** Bamboo builds rafts rather than boats. */
const RAFT_WOOD = 'bamboo';

/** Whether this rule breaks the entity, which is a boat, chest boat, raft or chest raft. */
export const isBreakableVehicle = (identifier: string): boolean => BOAT_ITEMS[identifier] !== undefined;

/**
 * The item a destroyed boat drops: `AbstractBoat.getDropItem`, the boat item of its own wood.
 * @param identifier - The Bedrock entity, `minecraft:boat` or `minecraft:chest_boat`.
 * @param variant - The wood the placing item named, such as `acacia`, kept in the spawn data.
 * @returns The item identifier, such as `minecraft:acacia_chest_boat`, or undefined for an entity
 *   that is no boat.
 */
export const boatItemOf = (identifier: string, variant: unknown): string | undefined => {
    const names = BOAT_ITEMS[identifier];
    if (names === undefined) return undefined;
    const wood = typeof variant === 'string' && variant.length > 0 ? variant : DEFAULT_WOOD;
    return `minecraft:${wood}_${wood === RAFT_WOOD ? names.raft : names.boat}`;
};

/**
 * What one blow does to a vehicle's damage.
 * @param damage - The damage it had.
 * @param amount - The blow, in half-hearts.
 * @returns The damage it has now, and whether that breaks it.
 */
export const vehicleBlow = (
    damage: number,
    amount: number
): { readonly damage: number; readonly destroyed: boolean } => {
    const next = damage + amount * VEHICLE_DAMAGE_PER_POINT;
    return { damage: next, destroyed: next > VEHICLE_BREAK_DAMAGE };
};
