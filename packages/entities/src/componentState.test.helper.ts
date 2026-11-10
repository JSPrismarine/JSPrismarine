import type { ComponentStateRecord, ComponentStateWrite } from './componentState';
import type { EntityEnvironment, EntityInstance } from './entityInstance';

/** An environment that also records every component state write into `writes`. */
export const observing = (writes: ComponentStateWrite[], environment: EntityEnvironment = {}): EntityEnvironment => ({
    ...environment,
    componentStateWritten: (entity, write) => {
        writes.push(write);
        environment.componentStateWritten?.(entity, write);
    }
});

/** The whole slot, as a plain object a test can compare. */
export const slotOf = (entity: EntityInstance): Record<string, ComponentStateRecord> =>
    Object.fromEntries(entity.componentState.entries());

/** What {@link tickThenUndo} saw. */
export interface UndoRun {
    /** The slot before the ticks. */
    readonly before: Record<string, ComponentStateRecord>;
    /** The slot after the ticks, before the undo. */
    readonly ticked: Record<string, ComponentStateRecord>;
    /** Every write the ticks made, in order. */
    readonly writes: readonly ComponentStateWrite[];
    /** The slot after writing each before-value back in reverse order. */
    readonly undone: Record<string, ComponentStateRecord>;
}

/**
 * Ticks an entity, then writes back the before-value of every component state write those ticks
 * made, newest first, which is how a host undoes a span.
 *
 * @param writes - The array the entity's environment records writes into, as {@link observing} fills.
 */
export const tickThenUndo = (entity: EntityInstance, writes: ComponentStateWrite[], ticks = 1): UndoRun => {
    const before = slotOf(entity);
    writes.length = 0;
    for (let count = 0; count < ticks; count += 1) entity.tick();
    const recorded = [...writes];
    const ticked = slotOf(entity);
    for (const write of [...recorded].reverse()) entity.componentState.write(write.component, write.before);
    return { before, ticked, writes: recorded, undone: slotOf(entity) };
};
