/**
 * The transitional adapter between the entity store and the legacy entities it does not hold.
 *
 * Every live entity is a store entity now, players included, and the only `Entity` subclasses
 * left are the test doubles that stand in for one. Until H-D of the entity and tick
 * re-architecture deletes `Entity`, this module is where the store meets one. It provides, as the
 * player spike's list numbers them (`docs/research/player-entity-spike.md`):
 *
 * 1. One id counter. Store ids and legacy runtime ids are both drawn from `entityIds`
 *    (`entity/entityIds.ts`; `LiveEntityRuntime` passes it as `EntityRuntimeOptions.nextId`), so
 *    a goal's target id means one entity.
 * 2. Legacy entities in the one index. `Entity.relocate` reports every legacy position write to
 *    `World.entityRelocated`, which refiles the entity in `EntityIndex` and logs the move here.
 * 6. Change log entries for a legacy entity's position and health, through
 *    {@link logLegacyWrite}, and the writer that undoes them, {@link legacyInverseWriter}.
 */
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';

import type { EntityStore, InverseWriter } from './data/EntityStore';
import type { Entity } from './Entity';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { isPlainRecord } from '../world/changelog/PlainData';
import type { PlainData } from '../world/changelog/PlainData';

/** The fields this adapter logs for a legacy entity. */
export type LegacyField = 'position' | 'health';

/**
 * The store a write to a legacy entity is logged in, or undefined when it is not logged.
 *
 * An entity the world does not hold, such as one still being built, is not logged.
 */
const legacyStoreOf = (entity: Entity): EntityStore | undefined => {
    const world = entity.getWorld();
    // A test's partial world double has no store to log into; a world without an entity runtime
    // for its dimension has none either.
    if (typeof world.getEntityStore !== 'function' || !world.hasEntityStore()) return undefined;
    if (world.getEntity(entity.getRuntimeId()) !== entity) return undefined;
    return world.getEntityStore();
};

/**
 * Logs one write to a legacy entity's state in the change log of the world it is in.
 *
 * @param entity - The entity written to.
 * @param field - Which field.
 * @param before - Its value before the write.
 * @param after - Its value after the write.
 */
export const logLegacyWrite = (entity: Entity, field: LegacyField, before: unknown, after: unknown): void => {
    legacyStoreOf(entity)?.writtenLegacy(entity.getRuntimeId(), field, before, after);
};

/**
 * Writes an inverse field entry back onto a legacy entity of `world`, without logging it.
 *
 * @param world - The world whose legacy entities the writer serves.
 * @returns The writer, for `EntityStore.addInverseWriter`.
 */
export const legacyInverseWriter =
    (world: World): InverseWriter =>
    (inverse) => {
        if (inverse.kind !== 'field' || inverse.field !== 'entity') return false;
        const entity = world.getEntity(inverse.address.entity);
        if (entity === null) return false;
        const { field } = inverse.address;
        const value = inverse.after;
        switch (field) {
            case 'position': {
                const at = positionIn(value);
                entity.restorePosition(new Position(at.x, at.y, at.z, world));
                return true;
            }
            case 'health':
                entity.attributes.setValue(AttributeIds.Health, numberIn(field, value));
                return true;
        }
        return false;
    };

const numberIn = (field: string, value: PlainData): number => {
    if (typeof value !== 'number') throw new TypeError(`${field} cannot hold ${String(value)}`);
    return value;
};

const positionIn = (value: PlainData): { x: number; y: number; z: number } => {
    if (
        !isPlainRecord(value) ||
        typeof value['x'] !== 'number' ||
        typeof value['y'] !== 'number' ||
        typeof value['z'] !== 'number'
    )
        throw new TypeError(`position cannot hold ${String(value)}`);
    return { x: value['x'], y: value['y'], z: value['z'] };
};
