/**
 * A player's state as components, each field written through a setter the change log hears
 * ([ADR 0012](../../../../docs/adr/0012-the-change-log-is-the-history.md)).
 *
 * [ADR 0008](../../../../docs/adr/0008-one-entity-model.md) makes a player an entity with
 * components for vitals, inventory, game mode and abilities. Until the player moves into the
 * entity store (slice 5 of the entity and tick re-architecture), `Player` holds one
 * {@link PlayerComponents} and reports each write through the legacy adapter, and the store's
 * undo writes a logged value back through {@link PlayerComponents.restore}.
 *
 * A field is named `<component>.<field>` in the log. Food, saturation, exhaustion and
 * experience stay in the player's attributes, which the client is sent and a save reads, so a
 * component reads and writes them there and keeps no second copy. Health, game mode and the
 * inventory are logged on their own paths, and air, mining and an unfinished meal are not
 * logged yet.
 */
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';

import type { ExperienceHolder } from './Experience';
import type { StoredSpawnPoint } from '../world/RespawnPoint';
import type { PlainData, PlainRecord } from '../world/changelog/PlainData';
import { isPlainRecord, plainOf } from '../world/changelog/PlainData';
import { booleanField, numberField, optionalNumberField } from './data/entityFields';

/** Every logged component field of a player, by the name its entries carry, with its value. */
export type PlayerComponentValues = {
    /** Food, out of 20. */
    'vitals.food': number;
    /** The hidden buffer spent before food. */
    'vitals.saturation': number;
    /** The counter that spends saturation and then food, a point for every four. */
    'vitals.exhaustion': number;
    /** Ticks spent with no breath left, counting toward the next lungful of damage. */
    'vitals.drowningTicks': number;
    /** How far the player has fallen since they were last supported. */
    'vitals.fallDistance': number;
    /** Whole experience levels. */
    'experience.level': number;
    /** How far along the current level the bar is, from 0 to 1. */
    'experience.progress': number;
    /** Whether the player is flying, which only a creative or spectator player may. */
    'abilities.flying': boolean;
    /** Whether the client reported the player sneaking. */
    'movement.sneaking': boolean;
    /** Whether the client reported the player asleep in a bed. */
    'movement.sleeping': boolean;
    /** Whether the client reported the player on the ground. */
    'movement.onGround': boolean;
    /** Where the player comes back after a death, or null for the world spawn. */
    'respawn.spawnPoint': StoredSpawnPoint | null;
    /** Whether the player has watched the end credits. */
    'respawn.seenCredits': boolean;
    /** The tick a held-item use, such as drawing a bow, began on, or null. */
    'itemUse.startedAt': number | null;
};

/** The name of one logged component field. */
export type PlayerComponentField = keyof PlayerComponentValues;

/** A fresh player's own fields, which is how Bedrock starts one. */
const initialState = () => ({
    'vitals.drowningTicks': 0,
    'vitals.fallDistance': 0,
    'abilities.flying': false,
    'movement.sneaking': false,
    'movement.sleeping': false,
    'movement.onGround': false,
    'respawn.spawnPoint': null,
    'respawn.seenCredits': false,
    'itemUse.startedAt': null
});

type OwnField = keyof ReturnType<typeof initialState>;
type OwnState = { -readonly [F in OwnField]: PlayerComponentValues[F] };

/** Where a field's value lives: the player's attributes, or the component's own state. */
type Home = { readonly attributes: Attributes; readonly own: OwnState };

/** How one field is read, written and read back from the log. */
type FieldDescriptor<T> = {
    readonly read: (home: Home) => T;
    readonly write: (home: Home, value: T) => void;
    readonly parse: (value: PlainData) => T;
};

/** A field kept in an attribute, which keeps it inside the attribute's bounds. */
const attribute = (name: string, field: PlayerComponentField): FieldDescriptor<number> => ({
    read: ({ attributes }) => attributes.getValue(name),
    write: ({ attributes }, value) => void attributes.setValue(name, value),
    parse: numberField(field)
});

/** A field the component keeps itself. */
const own = <F extends OwnField>(field: F, parse: (value: PlainData) => OwnState[F]): FieldDescriptor<OwnState[F]> => ({
    read: (home) => home.own[field],
    write: (home, value) => {
        home.own[field] = value;
    },
    parse
});

const spawnPointIn = (value: PlainData): StoredSpawnPoint | null => {
    if (value === null) return null;
    if (
        isPlainRecord(value) &&
        typeof value['x'] === 'number' &&
        typeof value['y'] === 'number' &&
        typeof value['z'] === 'number' &&
        typeof value['dimension'] === 'string' &&
        (value['forced'] === undefined || typeof value['forced'] === 'boolean')
    ) {
        const { x, y, z, dimension, forced } = value;
        return forced === undefined ? { x, y, z, dimension } : { x, y, z, dimension, forced };
    }
    throw new TypeError(`respawn.spawnPoint cannot hold ${JSON.stringify(value)}`);
};

const startedAtIn = (value: PlainData): number | null => optionalNumberField('itemUse.startedAt')(value) ?? null;

/** Every field, where it lives and how its logged value reads back. */
const FIELDS: { readonly [F in PlayerComponentField]: FieldDescriptor<PlayerComponentValues[F]> } = {
    'vitals.food': attribute(AttributeIds.PlayerHunger, 'vitals.food'),
    'vitals.saturation': attribute(AttributeIds.PlayerSaturation, 'vitals.saturation'),
    'vitals.exhaustion': attribute(AttributeIds.PlayerExhaustion, 'vitals.exhaustion'),
    'vitals.drowningTicks': own('vitals.drowningTicks', numberField('vitals.drowningTicks')),
    'vitals.fallDistance': own('vitals.fallDistance', numberField('vitals.fallDistance')),
    'experience.level': attribute(AttributeIds.PlayerLevel, 'experience.level'),
    'experience.progress': attribute(AttributeIds.PlayerExperience, 'experience.progress'),
    'abilities.flying': own('abilities.flying', booleanField('abilities.flying')),
    'movement.sneaking': own('movement.sneaking', booleanField('movement.sneaking')),
    'movement.sleeping': own('movement.sleeping', booleanField('movement.sleeping')),
    'movement.onGround': own('movement.onGround', booleanField('movement.onGround')),
    'respawn.spawnPoint': own('respawn.spawnPoint', spawnPointIn),
    'respawn.seenCredits': own('respawn.seenCredits', booleanField('respawn.seenCredits')),
    'itemUse.startedAt': own('itemUse.startedAt', startedAtIn)
};

const isComponentField = (field: string): field is PlayerComponentField => Object.hasOwn(FIELDS, field);

const COMPONENT_FIELDS: readonly PlayerComponentField[] = Object.keys(FIELDS).filter(isComponentField);

/** Hears one write to a component field, with its value before and after. */
export type PlayerComponentWritten = <F extends PlayerComponentField>(
    field: F,
    before: PlayerComponentValues[F],
    after: PlayerComponentValues[F]
) => void;

/** One player's component state, and the one place it is written. */
export class PlayerComponents {
    private readonly home: Home;

    /**
     * @param attributes - The player's attributes, where food, saturation, exhaustion and
     *   experience live.
     * @param written - Hears each write that changed a field.
     */
    public constructor(
        attributes: Attributes,
        private readonly written: PlayerComponentWritten
    ) {
        this.home = { attributes, own: initialState() };
    }

    /** The value a field holds. */
    public get<F extends PlayerComponentField>(field: F): PlayerComponentValues[F] {
        return FIELDS[field].read(this.home);
    }

    /**
     * Writes a field and reports the change. An attribute keeps a value inside its bounds, so
     * the value reported after the write is the one the attribute took.
     */
    public set<F extends PlayerComponentField>(field: F, value: PlayerComponentValues[F]): void {
        const descriptor = FIELDS[field];
        const before = descriptor.read(this.home);
        descriptor.write(this.home, value);
        const after = descriptor.read(this.home);
        if (before !== after) this.written(field, before, after);
    }

    /**
     * Runs a change made to the attributes behind these fields, such as a respawn's reset, and
     * reports each field it moved, as {@link PlayerComponents.set} would have.
     *
     * @param change - Writes the attributes directly.
     */
    public reportingChanges(change: () => void): void {
        const before = COMPONENT_FIELDS.map((field) => [field, this.get(field)] as const);
        change();
        for (const [field, value] of before) {
            const after = this.get(field);
            if (value !== after) this.written(field, value, after);
        }
    }

    /** Every field's value as plain data, by field name, which the replay digest hashes. */
    public snapshot(): PlainRecord {
        return Object.fromEntries(COMPONENT_FIELDS.map((field) => [field, plainOf(this.get(field)) ?? null]));
    }

    /** The experience fields as the holder the experience curve spends and grants through. */
    public experience(): ExperienceHolder {
        return {
            getLevel: () => this.get('experience.level'),
            getProgress: () => this.get('experience.progress'),
            setLevel: (level) => this.set('experience.level', level),
            setProgress: (progress) => this.set('experience.progress', progress)
        };
    }

    /**
     * Writes a logged value back without reporting it, which is how the store undoes a write.
     * @returns Whether `field` names a component field.
     * @throws {TypeError} When the value has a shape the field never holds.
     */
    public restore(field: string, value: PlainData): boolean {
        if (!isComponentField(field)) return false;
        this.restoreField(field, value);
        return true;
    }

    private restoreField<F extends PlayerComponentField>(field: F, value: PlainData): void {
        const descriptor = FIELDS[field];
        descriptor.write(this.home, descriptor.parse(value));
    }
}
