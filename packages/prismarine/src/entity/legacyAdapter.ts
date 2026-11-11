/**
 * The transitional adapter between the entity store and the legacy entities it does not hold.
 *
 * Players, dropped items and the eye of ender are still `Entity` subclasses until slices 3 and 5
 * of the entity and tick re-architecture move them into the store. Until then this module is
 * where the store meets them, and slice 5 deletes it with the legacy classes. It provides, as the
 * player spike's list numbers them (`docs/research/player-entity-spike.md`):
 *
 * 1. One id counter. Store ids and legacy runtime ids are both drawn from `entityIds`
 *    (`entity/entityIds.ts`; `LiveEntityRuntime` passes it as `EntityRuntimeOptions.nextId`), so
 *    a goal's target id means one entity.
 * 2. Legacy entities in the one index. `Entity.relocate` reports every legacy position write to
 *    `World.entityRelocated`, which refiles the entity in `EntityIndex` and logs the move here.
 * 3. to 5. Damage, effects, knockback and identity reach a legacy player by id through
 *    `EntityHostFacts` (`entity/data/host.ts` and `entity/data/live.ts`), unchanged.
 * 6. Change log entries for a legacy entity's position, health and a player's game mode, hand
 *    slot and component fields (`entity/playerComponents.ts`), through {@link logLegacyWrite}; one
 *    `inventory-slot` entry for each write to a slot a player carries, through
 *    {@link logLegacySlot}; and the writer that undoes them, {@link legacyInverseWriter}. A
 *    player's containers are the main inventory, the armor, the off hand, the ender chest, the
 *    cursor and the crafting grid, and each slot's value is the stack's saved form, so an undo
 *    restores what a save keeps.
 * 6a. One `impulse` occurrence for each shove a player's client is asked to take, through
 *    {@link logLegacyImpulse}, because the client owns a player's movement (ADR 0008).
 * 7. Store entities shown to legacy sessions, which `entity/data/storeActors.ts` does from store
 *    state, so the store logs their writes itself.
 */
import { getGametypeId } from '@jsprismarine/minecraft';
import { AttributeIds } from '@jsprismarine/protocol/wire/structures/Attribute';

import type { EntityStore, InverseWriter } from './data/EntityStore';
import type { Entity } from './Entity';
import type { PlayerContainer, SlotValue } from '../inventory/slotLog';
import type { PlayerComponentField } from './playerComponents';
import { Position } from '../world/Position';
import type { World } from '../world/World';
import { isPlainRecord } from '../world/changelog/PlainData';
import type { PlainData } from '../world/changelog/PlainData';

/** The fields this adapter logs for a legacy entity. */
export type LegacyField = 'position' | 'health' | 'gamemode' | 'inventory.handSlot' | PlayerComponentField;

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
 * Logs one write to a slot a legacy player carries in the change log of the world it is in.
 *
 * @param entity - The player written to.
 * @param container - The container the slot is in.
 * @param slot - The slot.
 * @param before - The slot's logged value before the write.
 * @param after - Its logged value after the write.
 */
export const logLegacySlot = (
    entity: Entity,
    container: PlayerContainer,
    slot: number,
    before: SlotValue,
    after: SlotValue
): void => {
    legacyStoreOf(entity)?.writtenSlot(entity.getRuntimeId(), container, slot, before, after);
};

/**
 * Logs an impulse a legacy player's client is asked to take, such as a blow's knockback, as an
 * occurrence in the change log of the world it is in. The player's position is not written.
 *
 * @param entity - The player shoved.
 * @param impulse - The impulse, in blocks per tick.
 */
export const logLegacyImpulse = (entity: Entity, impulse: { x: number; y: number; z: number }): void => {
    const { x, y, z } = impulse;
    legacyStoreOf(entity)?.occurred({
        kind: 'occurrence',
        occurrence: 'impulse',
        data: { entity: entity.getRuntimeId(), x, y, z }
    });
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
        if (inverse.kind !== 'field') return false;
        if (inverse.field === 'inventory-slot') {
            const { entity, container, slot } = inverse.address;
            return world.getEntity(entity)?.restoreLoggedSlot(container, slot, inverse.after) ?? false;
        }
        if (inverse.field !== 'entity') return false;
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
        return entity.restoreLoggedField(field, value);
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
