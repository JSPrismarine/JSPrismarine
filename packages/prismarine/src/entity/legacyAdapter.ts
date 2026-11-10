/**
 * The transitional adapter between the entity store and the legacy entities it does not hold.
 *
 * Players, dropped items and the eye of ender are still `Entity` subclasses until slices 3 and 5
 * of the entity and tick re-architecture move them into the store. Until then this module is
 * where the store meets them, and slice 5 deletes it with the legacy classes. It provides, as the
 * player spike's list numbers them (`docs/research/player-entity-spike.md`):
 *
 * 1. One id counter. Store ids and legacy runtime ids are both drawn from `Entity.runtimeIdCount`
 *    (`LiveEntityRuntime` passes it as `EntityRuntimeOptions.nextId`), so a goal's target id
 *    means one entity.
 * 2. Legacy entities in the one index. `Entity.relocate` reports every legacy position write to
 *    `World.entityRelocated`, which refiles the entity in `EntityIndex` and logs the move here.
 * 3. to 5. Damage, effects, knockback and identity reach a legacy player by id through
 *    `EntityHostFacts` (`entity/data/host.ts` and `entity/data/live.ts`), unchanged.
 * 6. Change log entries for a legacy entity's position, health and a player's game mode, through
 *    {@link logLegacyWrite}, and the writer that undoes them, {@link legacyInverseWriter}.
 *    Inventory slots are not logged: a slot changes by mutating the `Item` in place, and
 *    `Inventory` does not know its owner, so the digest covers a player's inventory only through
 *    the snapshot `World.replayStateDigest` hashes.
 * 7. Store entities shown to legacy sessions. The mirror in `entity/data/liveBodies.ts` does this
 *    until slice 4 deletes it.
 *
 * The data-driven mirror bodies are legacy entities too, but their fields are copies the mirror
 * writes from the store each tick, so their writes are not logged.
 */
import { getGametypeId } from '@jsprismarine/minecraft';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';

import type { InverseWriter } from './data/EntityStore';
import type { Entity } from './Entity';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { isPlainRecord } from '../world/changelog/PlainData';
import type { PlainData } from '../world/changelog/PlainData';

/** The fields this adapter logs for a legacy entity. */
export type LegacyField = 'position' | 'health' | 'gamemode';

/**
 * Logs one write to a legacy entity's state in the change log of the world it is in.
 *
 * An entity the world does not hold, such as one still being built, and a data-driven mirror
 * body are skipped.
 *
 * @param entity - The entity written to.
 * @param field - Which field.
 * @param before - Its value before the write.
 * @param after - Its value after the write.
 */
export const logLegacyWrite = (entity: Entity, field: LegacyField, before: unknown, after: unknown): void => {
    const world = entity.getWorld();
    // A test's partial world double has no store to log into; a world without an entity runtime
    // for its dimension has none either.
    if (typeof world.getEntityStore !== 'function' || !world.hasEntityStore()) return;
    if (world.getEntity(entity.getRuntimeId()) !== entity) return;
    if (world.dataEntities().bodies.entityIdOf(entity) !== undefined) return;
    world.getEntityStore().writtenLegacy(entity.getRuntimeId(), field, before, after);
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
            case 'gamemode':
                if (!('gamemode' in entity)) return false;
                entity.gamemode = getGametypeId(numberIn(field, value));
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
