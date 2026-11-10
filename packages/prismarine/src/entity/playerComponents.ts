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
 * A field is named `<component>.<field>` in the log. Food, saturation, exhaustion, experience
 * and the player's other attributes stay in the attributes, and air, breathing and sprinting in
 * the actor metadata, because the client is sent both and a save reads them, so a component
 * reads and writes them there and keeps no second copy. Health, game mode and the inventory are
 * logged on their own paths.
 */
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';
import type { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import { Metadata } from '@jsprismarine/protocol/wire/structures/Metadata';

import type { ExperienceHolder } from './Experience';
import type { StoredSpawnPoint } from '../world/RespawnPoint';
import type { PlainData, PlainRecord } from '../world/changelog/PlainData';
import { isPlainRecord, plainOf } from '../world/changelog/PlainData';
import { booleanField, numberField, optionalNumberField } from './data/entityFields';

/**
 * The block a player is mining, as plain data: its position, the face being mined, its runtime id
 * and how much of the 65535 a full break takes one tick is worth.
 */
export interface PlayerMining {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly face: number;
    readonly runtimeId: number;
    readonly progressPerTick: number;
}

/**
 * A meal in progress, as plain data: the tick it began on, how many ticks it takes and the item
 * being eaten or drunk. What it does once finished is resolved then, from the item.
 */
export interface PlayerMeal {
    readonly startedAt: number;
    readonly ticks: number;
    readonly item: string;
}

/** The part of the actor metadata a player's components keep air, breathing and sprinting in. */
export type PlayerMetadata = Pick<
    Metadata,
    'air' | 'setAir' | 'maxAir' | 'breathing' | 'setBreathing' | 'sprinting' | 'setSprinting'
>;

/** Every logged component field of a player, by the name its entries carry, with its value. */
export type PlayerComponentValues = {
    /** Food, out of 20. */
    'vitals.food': number;
    /** The hidden buffer spent before food. */
    'vitals.saturation': number;
    /** The counter that spends saturation and then food, a point for every four. */
    'vitals.exhaustion': number;
    /** Ticks of breath left, out of the metadata's maximum. */
    'vitals.air': number;
    /** Whether the player is breathing; false draws the bubble bar. */
    'vitals.breathing': boolean;
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
    /** Whether the player is sprinting. */
    'movement.sprinting': boolean;
    /** Absorption, the extra hearts spent before health. */
    'attributes.absorption': number;
    /** Knockback resistance, from 0 to 1. */
    'attributes.knockbackResistance': number;
    /** Movement speed on land. */
    'attributes.movement': number;
    /** Movement speed in water. */
    'attributes.underwaterMovement': number;
    /** Movement speed in lava. */
    'attributes.lavaMovement': number;
    /** Follow range. */
    'attributes.followRange': number;
    /** Attack damage. */
    'attributes.attackDamage': number;
    /** Luck. */
    'attributes.luck': number;
    /** Where the player comes back after a death, or null for the world spawn. */
    'respawn.spawnPoint': StoredSpawnPoint | null;
    /** Whether the player has watched the end credits. */
    'respawn.seenCredits': boolean;
    /** The tick a held-item use, such as drawing a bow, began on, or null. */
    'itemUse.startedAt': number | null;
    /** The block the player is mining, whose cracks are animated every tick, or null. */
    'mining.block': PlayerMining | null;
    /** The meal the player has started and not finished, or null. */
    'consumption.meal': PlayerMeal | null;
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
    'itemUse.startedAt': null,
    'mining.block': null,
    'consumption.meal': null
});

type OwnField = keyof ReturnType<typeof initialState>;
type OwnState = { -readonly [F in OwnField]: PlayerComponentValues[F] };

/** Where a field's value lives: the player's attributes, its metadata, or the component's own state. */
type Home = { readonly attributes: Attributes; readonly metadata: PlayerMetadata; readonly own: OwnState };

/** How one field is read, written and read back from the log. */
type FieldDescriptor<T> = {
    readonly read: (home: Home) => T;
    readonly write: (home: Home, value: T) => void;
    readonly parse: (value: PlainData) => T;
    /** The attribute the field is kept in, for a field kept in one. */
    readonly attribute?: string;
};

/** A field kept in an attribute, which keeps it inside the attribute's bounds. */
const attribute = (name: string, field: PlayerComponentField): FieldDescriptor<number> => ({
    read: ({ attributes }) => attributes.getValue(name),
    write: ({ attributes }, value) => void attributes.setValue(name, value),
    parse: numberField(field),
    attribute: name
});

/** A number kept in the metadata, which keeps it inside the metadata's bounds. */
const metadataNumber = (
    read: (metadata: PlayerMetadata) => number,
    write: (metadata: PlayerMetadata, value: number) => void,
    field: PlayerComponentField
): FieldDescriptor<number> => ({
    read: ({ metadata }) => read(metadata),
    write: ({ metadata }, value) => write(metadata, value),
    parse: numberField(field)
});

/** A flag kept in the metadata. */
const metadataFlag = (
    read: (metadata: PlayerMetadata) => boolean,
    write: (metadata: PlayerMetadata, value: boolean) => void,
    field: PlayerComponentField
): FieldDescriptor<boolean> => ({
    read: ({ metadata }) => read(metadata),
    write: ({ metadata }, value) => write(metadata, value),
    parse: booleanField(field)
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

const miningIn = (value: PlainData): PlayerMining | null => {
    if (value === null) return null;
    if (isPlainRecord(value)) {
        const { x, y, z, face, runtimeId, progressPerTick } = value;
        if (
            typeof x === 'number' &&
            typeof y === 'number' &&
            typeof z === 'number' &&
            typeof face === 'number' &&
            typeof runtimeId === 'number' &&
            typeof progressPerTick === 'number'
        )
            return { x, y, z, face, runtimeId, progressPerTick };
    }
    throw new TypeError(`mining.block cannot hold ${JSON.stringify(value)}`);
};

const mealIn = (value: PlainData): PlayerMeal | null => {
    if (value === null) return null;
    if (isPlainRecord(value)) {
        const { startedAt, ticks, item } = value;
        if (typeof startedAt === 'number' && typeof ticks === 'number' && typeof item === 'string')
            return { startedAt, ticks, item };
    }
    throw new TypeError(`consumption.meal cannot hold ${JSON.stringify(value)}`);
};

/** Every field, where it lives and how its logged value reads back. */
const FIELDS: { readonly [F in PlayerComponentField]: FieldDescriptor<PlayerComponentValues[F]> } = {
    'vitals.food': attribute(AttributeIds.PlayerHunger, 'vitals.food'),
    'vitals.saturation': attribute(AttributeIds.PlayerSaturation, 'vitals.saturation'),
    'vitals.exhaustion': attribute(AttributeIds.PlayerExhaustion, 'vitals.exhaustion'),
    'vitals.air': metadataNumber(
        (metadata) => metadata.air,
        (metadata, air) => metadata.setAir(air),
        'vitals.air'
    ),
    'vitals.breathing': metadataFlag(
        (metadata) => metadata.breathing,
        (metadata, breathing) => metadata.setBreathing(breathing),
        'vitals.breathing'
    ),
    'vitals.drowningTicks': own('vitals.drowningTicks', numberField('vitals.drowningTicks')),
    'vitals.fallDistance': own('vitals.fallDistance', numberField('vitals.fallDistance')),
    'experience.level': attribute(AttributeIds.PlayerLevel, 'experience.level'),
    'experience.progress': attribute(AttributeIds.PlayerExperience, 'experience.progress'),
    'abilities.flying': own('abilities.flying', booleanField('abilities.flying')),
    'movement.sneaking': own('movement.sneaking', booleanField('movement.sneaking')),
    'movement.sleeping': own('movement.sleeping', booleanField('movement.sleeping')),
    'movement.onGround': own('movement.onGround', booleanField('movement.onGround')),
    'movement.sprinting': metadataFlag(
        (metadata) => metadata.sprinting,
        (metadata, sprinting) => metadata.setSprinting(sprinting),
        'movement.sprinting'
    ),
    'attributes.absorption': attribute(AttributeIds.Absorption, 'attributes.absorption'),
    'attributes.knockbackResistance': attribute(AttributeIds.KnockbackResistence, 'attributes.knockbackResistance'),
    'attributes.movement': attribute(AttributeIds.Movement, 'attributes.movement'),
    'attributes.underwaterMovement': attribute(AttributeIds.UnderwaterMovement, 'attributes.underwaterMovement'),
    'attributes.lavaMovement': attribute(AttributeIds.LavaMovement, 'attributes.lavaMovement'),
    'attributes.followRange': attribute(AttributeIds.FollowRange, 'attributes.followRange'),
    'attributes.attackDamage': attribute(AttributeIds.AttackDamage, 'attributes.attackDamage'),
    'attributes.luck': attribute(AttributeIds.Luck, 'attributes.luck'),
    'respawn.spawnPoint': own('respawn.spawnPoint', spawnPointIn),
    'respawn.seenCredits': own('respawn.seenCredits', booleanField('respawn.seenCredits')),
    'itemUse.startedAt': own('itemUse.startedAt', startedAtIn),
    'mining.block': own('mining.block', miningIn),
    'consumption.meal': own('consumption.meal', mealIn)
};

const isComponentField = (field: string): field is PlayerComponentField => Object.hasOwn(FIELDS, field);

const COMPONENT_FIELDS: readonly PlayerComponentField[] = Object.keys(FIELDS).filter(isComponentField);

/** A field whose value is a number, which every field kept in an attribute is. */
type NumberField = {
    [F in PlayerComponentField]: PlayerComponentValues[F] extends number ? F : never;
}[PlayerComponentField];

/** Whether a field is kept in an attribute; only {@link attribute} names one, and its fields are numbers. */
const isAttributeField = (field: PlayerComponentField): field is NumberField => FIELDS[field].attribute !== undefined;

/** The fields kept in an attribute, by the attribute's id. */
const ATTRIBUTE_FIELDS: ReadonlyMap<string, NumberField> = new Map(
    COMPONENT_FIELDS.flatMap((field) => {
        const name = FIELDS[field].attribute;
        return name !== undefined && isAttributeField(field) ? [[name, field] as const] : [];
    })
);

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
     * @param attributes - The player's attributes, where food, saturation, exhaustion,
     *   experience and the other attributes live.
     * @param written - Hears each write that changed a field.
     * @param metadata - The player's actor metadata, where air, breathing and sprinting live.
     */
    public constructor(
        attributes: Attributes,
        private readonly written: PlayerComponentWritten,
        metadata: PlayerMetadata = new Metadata()
    ) {
        this.home = { attributes, metadata, own: initialState() };
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
     * Writes an attribute by its id through the field it is kept in, which reports the change.
     *
     * @param name - The attribute's id, such as `minecraft:movement`.
     * @param value - The wanted value, which the attribute keeps inside its bounds.
     * @returns Whether the attribute is a component field's, which an attribute such as health,
     *   logged on its own path, is not. Nothing is written when it is not.
     */
    public setAttribute(name: string, value: number): boolean {
        const field = ATTRIBUTE_FIELDS.get(name);
        if (field === undefined) return false;
        this.set(field, value);
        return true;
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
