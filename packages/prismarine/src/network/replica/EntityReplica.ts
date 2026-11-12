/**
 * What replication keeps of a world's entities, folded from the change log
 * ([ADR 0016](../../../../../docs/adr/0016-replication-reads-the-change-log.md)).
 *
 * An entity enters the replica with the saved form its membership entry carries, and every
 * entity and slot entry after it is written over that form, field by field, until a leaving entry
 * takes it out. The replica holds plain data only: each logged field by the name its entries
 * address it with (`entity/data/savedForm.ts`), and each container slot. It reads nothing of the
 * live simulation.
 *
 * {@link EntityReplica.view} answers what a client is shown of an entity, as the
 * {@link EntityView} a store actor makes from live state (`entity/data/actorView.ts`). The
 * component-derived part of the metadata is read off the component set the entity's type and its
 * logged groups resolve to, which is content and not simulation state.
 */
import type { EntityType, PropertyDefinition, PropertyValue } from '@jsprismarine/entities';
import { javaEntityNavigation } from '@jsprismarine/entities';

import type { ServerContent } from '../../content/ServerContent';
import type { ComponentView } from '../../entity/data/actorMetadata';
import { componentMetadataFacts, projectActorMetadata } from '../../entity/data/actorMetadata';
import type { EntityView, ShownHealth } from '../../entity/data/actorView';
import { conditionField } from '../../entity/data/DataEntity';
import {
    attributeIn,
    bodyFieldValue,
    booleanField,
    identityIn,
    propertyIn,
    statusEffectsIn,
    stringsIn
} from '../../entity/data/entityFields';
import { loggedFieldsOfSavedForm } from '../../entity/data/savedForm';
import type { EntityId } from '../../world/changelog/ChangeEntry';
import type { SealedTick } from '../../world/changelog/ChangeLog';
import { estimatePlainBytes } from '../../world/changelog/changeLogCost';
import type { PlainData, PlainRecord } from '../../world/changelog/PlainData';
import { isPlainRecord } from '../../world/changelog/PlainData';
import { syncedPropertiesOf } from '../actorProperties';

/** The prefix a leash holder's identity carries when the holder is a player. */
const PLAYER_HOLDER_PREFIX = 'player:';

/** One entity as the replica holds it. */
type HeldEntity = {
    readonly identifier: string;
    /** The stable identity a leash names its holder by. */
    readonly persistentIdentity: string | undefined;
    /** The `block` the spawn data names, which a falling block shows and nothing writes. */
    readonly spawnBlock: unknown;
    readonly fields: Map<string, PlainData>;
    /** Each container slot by `container:slot`, holding an item's saved form or nothing. */
    readonly slots: Map<string, PlainRecord | null>;
};

/** What one sealed tick changed in the entities clients see. */
export type EntityTickChanges = {
    /** The entities that entered the world, in the order they entered. */
    readonly entered: ReadonlySet<EntityId>;
    /** The entities that left it, in the order they left. */
    readonly left: ReadonlySet<EntityId>;
    /** The fields each entity still held at the end of the tick had written, by entity. */
    readonly fields: ReadonlyMap<EntityId, ReadonlySet<string>>;
    /** The slots each entity still held at the end of the tick had written, as `container:slot`. */
    readonly slots: ReadonlyMap<EntityId, ReadonlySet<string>>;
};

/** What the replica holds and what it has done, by count. */
export type EntityReplicaCounts = {
    /** The entities it holds. */
    readonly entities: number;
    /** The estimated bytes of their fields and slots (`estimatePlainBytes`). */
    readonly bytes: number;
    /** Membership, entity and slot entries read from sealed ticks. */
    readonly entriesRead: number;
    /** Views built from held fields. */
    readonly views: number;
};

/** Resolves a player's identity to the runtime id it has in this world, if it is here. */
export type PlayerIdOf = (identity: string) => number | undefined;

const addTo = (changes: Map<EntityId, Set<string>>, entity: EntityId, name: string): void => {
    let names = changes.get(entity);
    if (names === undefined) {
        names = new Set();
        changes.set(entity, names);
    }
    names.add(name);
};

/** The entities of one world as replication last read them. */
export class EntityReplica {
    private readonly entities = new Map<EntityId, HeldEntity>();
    private readonly byIdentity = new Map<string, EntityId>();
    /** One component view per type and group list, so the facts read off it are cached with it. */
    private readonly componentViews = new Map<string, ComponentView>();
    private viewsGeneration: number | undefined;
    private entriesRead = 0;
    private views = 0;

    /**
     * @param content - The content now, whose entity types the component sets resolve against.
     */
    public constructor(private readonly content: () => ServerContent) {}

    /**
     * Reads the membership, entity and slot entries of one sealed tick into the replica. An entry
     * for an entity the replica does not hold is passed over: its entity entered before the
     * replica was attached, or outside a tick, and no entry carried its saved form.
     * @param sealed - The tick, read once.
     * @returns What changed, for the flush.
     */
    public read(sealed: SealedTick): EntityTickChanges {
        const entered = new Set<EntityId>();
        const left = new Set<EntityId>();
        const fields = new Map<EntityId, Set<string>>();
        const slots = new Map<EntityId, Set<string>>();
        for (const entry of sealed.entries) {
            if (entry.kind === 'membership') {
                this.entriesRead++;
                if (entry.change === 'enter') {
                    this.enter(entry.entity, entry.saved);
                    left.delete(entry.entity);
                    entered.add(entry.entity);
                } else {
                    this.leave(entry.entity);
                    entered.delete(entry.entity);
                    left.add(entry.entity);
                }
                fields.delete(entry.entity);
                slots.delete(entry.entity);
                continue;
            }
            if (entry.kind !== 'field') continue;
            if (entry.field === 'entity') {
                this.entriesRead++;
                const { entity, field } = entry.address;
                const held = this.entities.get(entity);
                if (held === undefined) continue;
                held.fields.set(field, entry.after);
                if (!entered.has(entity)) addTo(fields, entity, field);
                continue;
            }
            if (entry.field !== 'inventory-slot') continue;
            this.entriesRead++;
            const { entity, container, slot } = entry.address;
            const held = this.entities.get(entity);
            if (held === undefined) continue;
            const key = `${container}:${slot}`;
            held.slots.set(key, entry.after);
            if (!entered.has(entity)) addTo(slots, entity, key);
        }
        return { entered, left, fields, slots };
    }

    /** Whether the replica holds an entity. */
    public has(entity: EntityId): boolean {
        return this.entities.has(entity);
    }

    /** Every entity the replica holds, in the order they entered. */
    public ids(): IterableIterator<EntityId> {
        return this.entities.keys();
    }

    /**
     * One logged field of an entity as the replica holds it.
     * @returns The value, or undefined when the entity or the field is not held.
     */
    public field(entity: EntityId, name: string): PlainData | undefined {
        return this.entities.get(entity)?.fields.get(name);
    }

    /**
     * One container slot of an entity as the replica holds it.
     * @returns The item's saved form, null for an empty slot, or undefined when it is not held.
     */
    public slot(entity: EntityId, container: string, slot: number): PlainRecord | null | undefined {
        return this.entities.get(entity)?.slots.get(`${container}:${slot}`);
    }

    /**
     * What a client is shown of an entity, from the fields the replica holds.
     * @param playerIdOf - Resolves a player that holds a leash to its runtime id in this world.
     * @returns The view, or undefined when the replica does not hold the entity.
     */
    public view(entity: EntityId, playerIdOf?: PlayerIdOf): EntityView | undefined {
        const held = this.entities.get(entity);
        if (held === undefined) return undefined;
        this.views++;

        const value = (name: string): PlainData => held.fields.get(name) ?? null;
        const type = this.typeOf(held.identifier);
        const groups = stringsIn('groups', value('groups'));
        const position = bodyFieldValue('position', value('position'));
        const beam = bodyFieldValue('beamTarget', value('beamTarget'));
        const metadata = projectActorMetadata(
            componentMetadataFacts(this.componentView(held.identifier, type, groups)),
            {
                onFire: bodyFieldValue('fireTicks', value('fireTicks')) > 0,
                inWater: booleanField('condition')(value(conditionField('in_water'))),
                fuseTicks: bodyFieldValue('fuseTicks', value('fuseTicks')),
                owned: bodyFieldValue('owner', value('owner')) !== undefined,
                leashHolderId: this.holderOf(identityIn('leash', value('leash')), playerIdOf),
                nameTag: bodyFieldValue('nameTag', value('nameTag')),
                color: bodyFieldValue('color', value('color')),
                beamX: beam === undefined ? undefined : Math.floor(beam.x),
                beamY: beam === undefined ? undefined : Math.floor(beam.y),
                beamZ: beam === undefined ? undefined : Math.floor(beam.z),
                showBottom: bodyFieldValue('showBottom', value('showBottom')) !== false,
                spawnBlock: held.spawnBlock
            }
        );

        const health = attributeIn(value('attribute:health'));
        const shownHealth: ShownHealth | undefined =
            health === null ? undefined : { current: health.current, max: health.max };
        return {
            identifier: held.identifier,
            pose: {
                x: position.x,
                y: position.y,
                z: position.z,
                yaw: bodyFieldValue('yaw', value('yaw')),
                pitch: bodyFieldValue('pitch', value('pitch'))
            },
            velocity: bodyFieldValue('velocity', value('velocity')),
            onGround: booleanField('condition')(value(conditionField('on_ground'))),
            metadata,
            health: shownHealth,
            properties: syncedPropertiesOf(propertiesOf(type?.entity.description.properties, held.fields)),
            statusEffects: statusEffectsIn(value('statusEffects')),
            equipment: bodyFieldValue('equipment', value('equipment'))
        };
    }

    /** What the replica holds and what it has done. */
    public counts(): EntityReplicaCounts {
        let bytes = 0;
        for (const { fields, slots } of this.entities.values()) {
            for (const [name, value] of fields) bytes += name.length * 2 + estimatePlainBytes(value);
            for (const [key, value] of slots) bytes += key.length * 2 + estimatePlainBytes(value);
        }
        return { entities: this.entities.size, bytes, entriesRead: this.entriesRead, views: this.views };
    }

    private enter(entity: EntityId, saved: PlainRecord): void {
        this.leave(entity);
        const record = saved['record'];
        const plainRecord = record !== undefined && isPlainRecord(record) ? record : {};
        const identifier = plainRecord['identifier'];
        const identity = plainRecord['persistentIdentity'];
        const spawnData = plainRecord['spawnData'];
        this.entities.set(entity, {
            identifier: typeof identifier === 'string' ? identifier : '',
            persistentIdentity: typeof identity === 'string' ? identity : undefined,
            spawnBlock: spawnData !== undefined && isPlainRecord(spawnData) ? spawnData['block'] : undefined,
            fields: loggedFieldsOfSavedForm(saved),
            slots: new Map()
        });
        if (typeof identity === 'string') this.byIdentity.set(identity, entity);
    }

    private leave(entity: EntityId): void {
        const held = this.entities.get(entity);
        if (held === undefined) return;
        this.entities.delete(entity);
        if (held.persistentIdentity !== undefined && this.byIdentity.get(held.persistentIdentity) === entity)
            this.byIdentity.delete(held.persistentIdentity);
    }

    /** The runtime id of a leash holder named by its identity, as `EntityRuntime.leashHolderIdOf` finds it. */
    private holderOf(identity: string | undefined, playerIdOf: PlayerIdOf | undefined): number | undefined {
        if (identity === undefined) return undefined;
        const held = this.byIdentity.get(identity);
        if (held !== undefined) return Number(held);
        if (!identity.startsWith(PLAYER_HOLDER_PREFIX)) return undefined;
        return playerIdOf?.(identity.slice(PLAYER_HOLDER_PREFIX.length));
    }

    private typeOf(identifier: string): EntityType | undefined {
        const registry = this.content().entities.registry;
        if (this.viewsGeneration !== registry.generation) {
            this.componentViews.clear();
            this.viewsGeneration = registry.generation;
        }
        return registry.get(identifier);
    }

    /** The component set a type and its active groups resolve to, as the live instance builds it. */
    private componentView(identifier: string, type: EntityType | undefined, groups: readonly string[]): ComponentView {
        const key = [identifier, ...groups].join('\n');
        const cached = this.componentViews.get(key);
        if (cached !== undefined) return cached;

        // Base components first, then each group in the order it became active, a later one
        // replacing an earlier component of the same name: `EntityInstance`'s own order.
        const active = new Map<string, unknown>();
        for (const component of type?.components ?? []) active.set(component.name, component.params);
        for (const group of groups)
            for (const component of type?.groups.get(group)?.components ?? [])
                active.set(component.name, component.params);
        const javaNavigation = javaEntityNavigation(identifier, this.content().entities.javaNavigation);
        const view: ComponentView = {
            get componentSetToken() {
                return view;
            },
            componentParams: (name) => active.get(name),
            hasComponent: (name) => active.has(name),
            javaNavigation
        };
        this.componentViews.set(key, view);
        return view;
    }
}

/** An entity's property values as the replica holds them, over its type's definitions in their order. */
const propertiesOf = (
    definitions: ReadonlyMap<string, PropertyDefinition> | undefined,
    fields: ReadonlyMap<string, PlainData>
) => ({
    names: (): readonly string[] => [...(definitions?.keys() ?? [])],
    definition: (name: string): PropertyDefinition | undefined => definitions?.get(name),
    get: (name: string): PropertyValue | undefined => {
        const value = fields.get(`property:${name}`);
        return value === undefined ? undefined : propertyIn(value);
    }
});
