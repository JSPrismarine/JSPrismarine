import type BinaryStream from '@jsprismarine/binaryutils';
import { NetworkUtil } from '../network/NetworkUtil';

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
} as const;

export type AttributeId = (typeof AttributeIds)[keyof typeof AttributeIds];

const MAX_FLOAT32 = 3.4028234663852886e38;

export class Attribute {
    private readonly name: string;
    private readonly min: number;
    private readonly max: number;
    private readonly default: number;

    /**
     * The live value.
     *
     * Not readonly: an attribute is the entity's state, not a snapshot of it. While it was
     * frozen the only way to change hunger or health was to build a whole new attribute and
     * put it somewhere, which nothing did - so every value the client ever saw was the one
     * hard-coded in {@link Attributes.getDefaults}.
     */
    private value: number;

    /**
     * Class used to store Attribute data.
     *
     * @param {object} data - The attribute data.
     * @param {string} data.name - The name of the attribute.
     * @param {number} data.min - The minimum value of the attribute.
     * @param {number} data.max - The maximum value of the attribute.
     * @param {number} data.def - The default value of the attribute.
     * @param {number} [data.value=data.def] - The current value of the attribute.
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
        value?: number;
    }) {
        this.name = name;
        this.min = min;
        this.max = max;
        this.default = def;
        this.value = Attribute.clamp(value ?? def, min, max);
    }

    private static clamp(value: number, min: number, max: number): number {
        // NaN survives Math.min/Math.max, and one NaN float in the packet makes the client
        // drop the whole attribute list - so it is turned back into the minimum here.
        if (!Number.isFinite(value)) return min;
        return Math.min(Math.max(value, min), max);
    }

    /**
     * Writes one attribute in the layout protocol {@link Identifiers.Protocol} defines:
     * `min, max, current, default_min, default_max, default, name, modifiers`.
     *
     * The `default_min` / `default_max` pair is what the client falls back to when an
     * attribute is reset. We do not track bounds that differ from the live ones, so they
     * are sent as the live bounds - the same thing PocketMine does. Omitting them costs
     * eight bytes per attribute and desynchronises everything after it, which the client
     * only notices once it reads a nonsensical string length further down the packet.
     * @see https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.21.42/protocol.json
     */
    public networkSerialize(stream: BinaryStream): void {
        stream.writeFloatLE(this.min);
        stream.writeFloatLE(this.max);
        stream.writeFloatLE(this.value);
        stream.writeFloatLE(this.min); // default_min
        stream.writeFloatLE(this.max); // default_max
        stream.writeFloatLE(this.default);
        NetworkUtil.writeString(stream, this.name);
        stream.writeUnsignedVarInt(0); // TODO: modifier count
    }

    /**
     * Writes one attribute in the *other* layout the protocol has for them, the one
     * `AddActor` carries: `name, min, current, max`, with no defaults and no modifiers.
     *
     * Note the order - the current value sits between the bounds here, where
     * {@link Attribute.networkSerialize} puts it after them. Getting the two confused
     * silently swaps an entity's health with its upper bound.
     * @param {BinaryStream} stream - The network stream.
     * @see https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.21.42/protocol.json `EntityAttributes`
     */
    public networkSerializeInitial(stream: BinaryStream): void {
        NetworkUtil.writeString(stream, this.name);
        stream.writeFloatLE(this.min);
        stream.writeFloatLE(this.value);
        stream.writeFloatLE(this.max);
    }

    public static networkDeserializeInitial(stream: BinaryStream): Attribute {
        const name = NetworkUtil.readString(stream);
        const min = stream.readFloatLE();
        const value = stream.readFloatLE();
        const max = stream.readFloatLE();

        // The layout carries no default, so the value stands in for one.
        return new Attribute({ name, min, max, value, def: value });
    }

    public static networkDeserialize(stream: BinaryStream): Attribute {
        const min = stream.readFloatLE();
        const max = stream.readFloatLE();
        const value = stream.readFloatLE();
        stream.readFloatLE(); // default_min, folded into min above
        stream.readFloatLE(); // default_max, folded into max above
        const def = stream.readFloatLE();

        const attr = new Attribute({ min, max, value, def, name: NetworkUtil.readString(stream) });
        stream.readUnsignedVarInt(); // TODO: skip modifiers for now
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

    /**
     * Set the current value, clamped to the attribute's bounds.
     * @param {number} value - The wanted value.
     * @returns {boolean} `true` if the stored value actually changed.
     */
    public setValue(value: number): boolean {
        const clamped = Attribute.clamp(value, this.min, this.max);
        if (clamped === this.value) return false;

        this.value = clamped;
        return true;
    }

    /**
     * Restore the attribute to its default value.
     * @returns {boolean} `true` if the stored value actually changed.
     */
    public reset(): boolean {
        return this.setValue(this.default);
    }

    /**
     * Copy of this attribute, at its current value.
     * @returns {Attribute} The copy.
     */
    public clone(): Attribute {
        return new Attribute({
            name: this.name,
            min: this.min,
            max: this.max,
            def: this.default,
            value: this.value
        });
    }
}

/**
 * The attributes of a single entity.
 *
 * Keyed by name, because that is how the protocol addresses them and how everything that
 * changes one refers to it. It used to be an array that was never written to, next to a
 * `getDefaults()` that built a fresh list on every call - so an entity had no attribute
 * state at all, and the client was handed the same constants at every spawn.
 */
export class Attributes {
    private readonly attributes = new Map<string, Attribute>();

    /**
     * Names whose value changed since the last {@link Attributes.clearDirty}.
     *
     * The client accepts a partial attribute list, so only what moved has to be sent.
     */
    private readonly dirty = new Set<string>();

    /**
     * @param {Attribute[]} [attributes=Attributes.getDefaults()] - The attributes to start from.
     */
    public constructor(attributes: Attribute[] = Attributes.getDefaults()) {
        for (const attribute of attributes) this.attributes.set(attribute.getName(), attribute);
    }

    /**
     * The attributes every living entity has.
     *
     * Deliberately not the whole of {@link AttributeIds}. An attribute is a property of the
     * actor it belongs to, and the client looks each one up in the actor's own map: names
     * that actor does not have are not "extra information", they are entries with nowhere to
     * go. Handing a cow `minecraft:player.hunger` - or a horse's jump strength to a player -
     * is how the whole list ends up ignored.
     * @returns {Attribute[]} Freshly built attributes, safe to mutate.
     */
    public static getDefaults(): Attribute[] {
        return [
            new Attribute({
                name: AttributeIds.Health,
                min: 0,
                max: 20,
                def: 20
            }),
            new Attribute({
                name: AttributeIds.Absorption,
                min: 0,
                max: MAX_FLOAT32,
                def: 0
            }),
            new Attribute({
                name: AttributeIds.KnockbackResistence,
                min: 0,
                max: 1,
                def: 0
            }),
            new Attribute({
                name: AttributeIds.Movement,
                min: 0,
                max: MAX_FLOAT32,
                def: 0.1
            }),
            new Attribute({
                name: AttributeIds.UnderwaterMovement,
                min: 0,
                max: MAX_FLOAT32,
                def: 0.02
            }),
            new Attribute({
                name: AttributeIds.LavaMovement,
                min: 0,
                max: MAX_FLOAT32,
                def: 0.02
            }),
            new Attribute({
                name: AttributeIds.FollowRange,
                min: 0,
                max: 2048,
                def: 16
            }),
            new Attribute({
                name: AttributeIds.AttackDamage,
                min: 0,
                max: MAX_FLOAT32,
                def: 1
            })
        ];
    }

    /**
     * The above, plus the ones only a player has: the food bar and its two hidden
     * counterparts, experience, and luck.
     * @returns {Attribute[]} Freshly built attributes, safe to mutate.
     */
    public static getPlayerDefaults(): Attribute[] {
        return [
            ...Attributes.getDefaults(),
            new Attribute({
                name: AttributeIds.PlayerHunger,
                min: 0,
                max: 20,
                def: 20
            }),
            new Attribute({
                name: AttributeIds.PlayerSaturation,
                min: 0,
                max: 20,
                def: 20
            }),
            // Vanilla bounds the exhaustion counter at 5 and spends it 4 at a time; see
            // `Player.addExhaustion`.
            new Attribute({
                name: AttributeIds.PlayerExhaustion,
                min: 0,
                max: 5,
                def: 0
            }),
            new Attribute({
                name: AttributeIds.PlayerLevel,
                min: 0,
                max: 24791,
                def: 0
            }),
            new Attribute({
                name: AttributeIds.PlayerExperience,
                min: 0,
                max: 1,
                def: 0
            }),
            new Attribute({
                name: AttributeIds.Luck,
                min: -1024,
                max: 1024,
                def: 0
            })
        ];
    }

    /**
     * Every attribute the entity has.
     * @returns {Attribute[]} The attributes.
     */
    public getAttributes(): Attribute[] {
        return Array.from(this.attributes.values());
    }

    /**
     * Look one attribute up by name.
     * @param {string} name - The attribute's namespaced id, see {@link AttributeIds}.
     * @returns {Attribute | null} The attribute, or `null` if the entity has none by that name.
     */
    public getAttribute(name: string): Attribute | null {
        return this.attributes.get(name) ?? null;
    }

    /**
     * Add an attribute, replacing any attribute of the same name.
     * @param {Attribute} attribute - The attribute.
     */
    public setAttribute(attribute: Attribute): void {
        this.attributes.set(attribute.getName(), attribute);
        this.dirty.add(attribute.getName());
    }

    /**
     * The current value of one attribute.
     * @param {string} name - The attribute's namespaced id, see {@link AttributeIds}.
     * @param {number} [fallback=0] - Returned when the entity has no such attribute.
     * @returns {number} The value.
     * @example
     * ```typescript
     * const food = player.attributes.getValue(AttributeIds.PlayerHunger);
     * ```
     */
    public getValue(name: string, fallback = 0): number {
        return this.getAttribute(name)?.getValue() ?? fallback;
    }

    /**
     * Set the value of one attribute, clamped to its bounds.
     * @param {string} name - The attribute's namespaced id, see {@link AttributeIds}.
     * @param {number} value - The wanted value.
     * @returns {boolean} `true` if the value changed, and so needs sending to clients.
     */
    public setValue(name: string, value: number): boolean {
        const attribute = this.getAttribute(name);
        if (!attribute?.setValue(value)) return false;

        this.dirty.add(name);
        return true;
    }

    /**
     * Add to the value of one attribute, clamped to its bounds.
     * @param {string} name - The attribute's namespaced id, see {@link AttributeIds}.
     * @param {number} delta - How much to add; may be negative.
     * @returns {boolean} `true` if the value changed.
     */
    public addValue(name: string, delta: number): boolean {
        const attribute = this.getAttribute(name);
        if (!attribute) return false;

        return this.setValue(name, attribute.getValue() + delta);
    }

    /**
     * Put every attribute back to its default value, as vanilla does on respawn.
     */
    public reset(): void {
        for (const [name, attribute] of this.attributes) {
            if (attribute.reset()) this.dirty.add(name);
        }
    }

    /**
     * The attributes whose value changed since they were last sent.
     * @returns {Attribute[]} The changed attributes.
     */
    public getDirty(): Attribute[] {
        return Array.from(this.dirty)
            .map((name) => this.attributes.get(name))
            .filter((attribute): attribute is Attribute => attribute !== undefined);
    }

    /**
     * Forget which attributes changed. Called once they have been sent.
     */
    public clearDirty(): void {
        this.dirty.clear();
    }

    /**
     * Mark every attribute as needing to be sent again, for instance because the client
     * rebuilt its player from scratch.
     */
    public markAllDirty(): void {
        for (const name of this.attributes.keys()) this.dirty.add(name);
    }
}
