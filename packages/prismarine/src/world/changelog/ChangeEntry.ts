import type { ActorEvent, LevelSoundEvent } from '@jsprismarine/minecraft';

import { blockPositionKey } from '../positionKeys';
import type { PlainData, PlainRecord } from './PlainData';

/** An entity's runtime id, the only way an entry refers to an entity. */
export type EntityId = bigint;

/**
 * The address and value types of one field kind.
 *
 * The constraints are the plain-data check: a field kind whose address or value is not
 * {@link PlainData} does not compile.
 */
export type FieldKindShape<Address extends PlainRecord, Value extends PlainData> = {
    /** Which field of the world the entry changed. */
    readonly address: Address;
    /** What the field holds. */
    readonly value: Value;
};

/**
 * Every kind of field a field entry can change, by name.
 *
 * Adding a field kind is adding a member here and a coalescing key in `FIELD_KEYS` below. The
 * log, spans, inversion and the reader handle every kind the same way, so none of them changes.
 */
export interface FieldKinds {
    /** One field of one entity, such as `position` or `health`. */
    entity: FieldKindShape<{ readonly entity: EntityId; readonly field: string }, PlainData>;
    /** The block at a position, on one storage layer, as a block runtime id. */
    block: FieldKindShape<
        { readonly x: number; readonly y: number; readonly z: number; readonly layer: number },
        number
    >;
    /** One slot of one of an entity's containers, holding an item's saved form or nothing. */
    'inventory-slot': FieldKindShape<
        { readonly entity: EntityId; readonly container: string; readonly slot: number },
        PlainRecord | null
    >;
    /** One field of the block entity at a position. */
    'block-entity': FieldKindShape<
        { readonly x: number; readonly y: number; readonly z: number; readonly field: string },
        PlainData
    >;
}

/** The name of a field kind. */
export type FieldKind = keyof FieldKinds;

/**
 * One field changed from `before` to `after`. Its inverse writes `before` back.
 *
 * `FieldEntry` alone is the union over every kind, and checking `field` narrows `address` and
 * the values to that kind's types.
 */
export type FieldEntry<K extends FieldKind = FieldKind> = {
    [P in K]: {
        readonly kind: 'field';
        /** Which kind of field changed. */
        readonly field: P;
        /** Which field of that kind. */
        readonly address: FieldKinds[P]['address'];
        /** The value the field held before the change. */
        readonly before: FieldKinds[P]['value'];
        /** The value the field holds after the change. */
        readonly after: FieldKinds[P]['value'];
    };
}[K];

/**
 * An entity entered or left the world's store.
 *
 * It carries the entity's saved form, which is the state the entity had at that moment, so the
 * inverse of a departure can add the entity back. The inverse of an arrival is a departure with
 * the same saved form.
 */
export type MembershipEntry = {
    readonly kind: 'membership';
    /** Whether the entity entered or left. */
    readonly change: 'enter' | 'leave';
    /** Which entity. */
    readonly entity: EntityId;
    /** The entity's saved form at the moment it entered or left. */
    readonly saved: PlainRecord;
};

/**
 * A chunk entered or left the world.
 *
 * It names the chunk and does not carry its content: a loaded or generated chunk arrives as an
 * input, so the input record holds the content. Because of that, a chunk entry has no inverse,
 * and history cannot be read backward past one.
 */
export type ChunkEntry = {
    readonly kind: 'chunk';
    /** Whether the chunk entered or left. */
    readonly change: 'enter' | 'leave';
    /** The chunk's x coordinate, in chunks. */
    readonly x: number;
    /** The chunk's z coordinate, in chunks. */
    readonly z: number;
};

/**
 * The data of one occurrence kind, checked to be plain data where it is declared.
 */
export type OccurrenceShape<Data extends PlainRecord> = Data;

/**
 * Every kind of one-shot occurrence, by name, with its data.
 *
 * An occurrence changes no state. It is in the log because replication has to send it and
 * nothing in the state afterwards would show it happened. Adding a kind is adding a member here.
 * Replication owns what each kind carries and extends these when it reads them.
 */
export interface OccurrenceKinds {
    /** An actor event on one entity, such as being hurt, dying or eating. */
    'actor-event': OccurrenceShape<{ readonly entity: EntityId; readonly event: ActorEvent; readonly data: number }>;
    /** An entity's animation, such as swinging an arm. */
    animate: OccurrenceShape<{ readonly entity: EntityId; readonly action: number }>;
    /** A sound at a position. */
    sound: OccurrenceShape<{
        readonly x: number;
        readonly y: number;
        readonly z: number;
        readonly sound: LevelSoundEvent;
        readonly data: number;
    }>;
    /** An entity's emote. */
    emote: OccurrenceShape<{ readonly entity: EntityId; readonly emote: string }>;
}

/** The name of an occurrence kind. */
export type OccurrenceKind = keyof OccurrenceKinds;

/** A one-shot occurrence. It changes no state, so its inverse is nothing. */
export type OccurrenceEntry<K extends OccurrenceKind = OccurrenceKind> = {
    [P in K]: {
        readonly kind: 'occurrence';
        /** Which kind of occurrence. */
        readonly occurrence: P;
        /** What replication needs to send it. */
        readonly data: OccurrenceKinds[P];
    };
}[K];

/**
 * One entry of the change log ([ADR 0012](../../../../../docs/adr/0012-the-change-log-is-the-history.md)).
 *
 * Every entry is {@link PlainData}, so a sealed tick can be handed to another thread as it is.
 * Checking `kind` narrows to one of the four entry types.
 */
export type ChangeEntry = FieldEntry | MembershipEntry | ChunkEntry | OccurrenceEntry;

/**
 * An entry that changes authoritative state and has an inverse: what a store applies.
 */
export type StateEntry = FieldEntry | MembershipEntry;

/**
 * Returns the entry that undoes `entry`.
 *
 * A field entry's inverse writes the before-value, and a membership entry's inverse reverses the
 * direction with the same saved form. Applying an entry and then its inverse leaves the state
 * where it was, and the inverse of the inverse equals the original.
 * @param {StateEntry} entry - The entry to undo.
 * @returns {StateEntry} The entry that undoes it.
 */
export function inverseOf(entry: StateEntry): StateEntry {
    if (entry.kind === 'membership') return { ...entry, change: entry.change === 'enter' ? 'leave' : 'enter' };
    return invertField(entry);
}

function invertField<K extends FieldKind>(entry: FieldEntry<K>): FieldEntry<K> {
    return { ...entry, before: entry.after, after: entry.before };
}

/** A key that identifies one field within its kind, for coalescing. */
export type FieldKey = string | number | bigint;

const FIELD_KEYS: { readonly [K in FieldKind]: (address: FieldKinds[K]['address']) => FieldKey } = {
    entity: ({ entity, field }) => `${entity}:${field}`,
    // The common layer packs into one exact integer. Other layers are rare, so a string is fine.
    block: ({ x, y, z, layer }) => (layer === 0 ? blockPositionKey(x, y, z) : `${layer}:${x},${y},${z}`),
    'inventory-slot': ({ entity, container, slot }) => `${entity}:${container}:${slot}`,
    'block-entity': ({ x, y, z, field }) => `${x},${y},${z}:${field}`
};

/**
 * Returns the key of the field `entry` changed. Two entries of the same kind change the same
 * field exactly when their keys are equal.
 * @param {FieldEntry} entry - The entry.
 * @returns {FieldKey} The field's key within its kind.
 */
export function fieldKey<K extends FieldKind>(entry: FieldEntry<K>): FieldKey {
    const key: (address: FieldKinds[K]['address']) => FieldKey = FIELD_KEYS[entry.field];
    return key(entry.address);
}
