/**
 * Entity attributes. Bedrock's attribute components (`minecraft:health`,
 * `minecraft:movement`, `minecraft:attack` and the rest) each declare a base
 * value and sometimes a maximum, and the live value moves between them.
 *
 * A component writes its attribute when it initializes, which is also what
 * makes a re-added component group reset the stat it carries.
 */

/** The attribute names the implemented components write. */
export const ATTRIBUTES = [
    'absorption',
    'attack_damage',
    'flying_speed',
    'follow_range',
    'health',
    'jump_strength',
    'knockback_resistance',
    'lava_movement',
    'luck',
    'movement',
    'underwater_movement'
] as const;

/** One of {@link ATTRIBUTES}. */
export type AttributeName = (typeof ATTRIBUTES)[number];

/** One attribute's live value with the bounds its component declared. */
export interface Attribute {
    /** The value the component declared, which a reset returns to. */
    readonly base: number;
    readonly min: number;
    readonly max: number;
    /** The value now, always within the bounds. */
    readonly current: number;
}

/** How a component declares an attribute. */
export interface AttributeSpec {
    /** The starting value; the component's `value`. */
    base: number;
    /** The component's `max`, defaulting to the base. */
    max?: number;
    /** The component's `min`, defaulting to 0. */
    min?: number;
}

/**
 * One change to an attribute, as a host observes it.
 *
 * `null` stands for an attribute no component declares, so writing `before` back with
 * {@link Attributes.restore} undoes the change exactly.
 */
export interface AttributeWrite {
    /** The attribute that changed. */
    readonly name: AttributeName;
    /** The attribute before the change, or `null` when it was undeclared. */
    readonly before: Attribute | null;
    /** The attribute after the change, or `null` when the change removed it. */
    readonly after: Attribute | null;
}

/** Whether two attribute values hold the same four numbers. */
const sameAttribute = (left: Attribute | null, right: Attribute | null): boolean =>
    left === right ||
    (left !== null &&
        right !== null &&
        left.base === right.base &&
        left.min === right.min &&
        left.max === right.max &&
        left.current === right.current);

/** The live attributes of one entity. */
export class Attributes {
    private readonly values = new Map<AttributeName, Attribute>();

    /**
     * @param overrides - Base values that replace whatever a component
     *   declares, which is how a stat Java Edition decides reaches an entity
     *   built from a Bedrock pack. An overridden attribute has no range: the
     *   base and the maximum are both the given value.
     * @param written - Called after every change, with the attribute before and after it. A
     *   write that leaves all four numbers as they were is not reported.
     */
    public constructor(
        private readonly overrides: ReadonlyMap<AttributeName, number> = new Map(),
        private readonly written?: (write: AttributeWrite) => void
    ) {}

    /**
     * Declares an attribute and sets it to its base value.
     *
     * A second call replaces the attribute whole, which is what a re-added
     * component group does to the stat it carries.
     */
    public define(name: AttributeName, spec: AttributeSpec): Attribute {
        const override = this.overrides.get(name);
        const min = spec.min ?? 0;
        const max = Math.max(min, override ?? spec.max ?? spec.base);
        const base = Math.min(max, Math.max(min, override ?? spec.base));
        const attribute: Attribute = { base, min, max, current: base };
        this.put(name, attribute);
        return attribute;
    }

    /** The attribute, or undefined when no component on the entity declares it. */
    public get(name: AttributeName): Attribute | undefined {
        return this.values.get(name);
    }

    /** The current value, or the fallback when no component declares the attribute. */
    public value(name: AttributeName, fallback = 0): number {
        return this.values.get(name)?.current ?? fallback;
    }

    /**
     * Moves an attribute to a new value, clamped into its bounds.
     *
     * @returns The stored value, or undefined when the attribute is undeclared.
     */
    public set(name: AttributeName, value: number): number | undefined {
        const attribute = this.values.get(name);
        if (attribute === undefined) return undefined;
        const current = Math.min(attribute.max, Math.max(attribute.min, value));
        this.put(name, { ...attribute, current });
        return current;
    }

    /**
     * Moves an attribute's maximum, as `/attribute max_health base set` does, and holds its base
     * and its value now to the new bound.
     *
     * @returns The stored maximum, never below the minimum, or undefined when the attribute is
     *   undeclared.
     */
    public setMax(name: AttributeName, max: number): number | undefined {
        const attribute = this.values.get(name);
        if (attribute === undefined) return undefined;
        const bounded = Math.max(attribute.min, max);
        this.put(name, {
            ...attribute,
            max: bounded,
            base: Math.min(attribute.base, bounded),
            current: Math.min(attribute.current, bounded)
        });
        return bounded;
    }

    /**
     * Puts an attribute back exactly as an {@link AttributeWrite} described it, bounds and all,
     * or removes it for `null`. This is how a host undoes a change.
     */
    public restore(name: AttributeName, attribute: Attribute | null): void {
        this.put(name, attribute);
    }

    /** Every declared attribute, in declaration order. */
    public names(): readonly AttributeName[] {
        return [...this.values.keys()];
    }

    /** The one write path, which reports each change. */
    private put(name: AttributeName, attribute: Attribute | null): void {
        const before = this.values.get(name) ?? null;
        if (attribute === null) this.values.delete(name);
        else this.values.set(name, attribute);
        if (!sameAttribute(before, attribute)) this.written?.({ name, before, after: attribute });
    }
}
