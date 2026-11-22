import { defineErrors } from './defineErrors';

/** The errors `@jsprismarine/entity-brains` throws. */
export const EntityBrainsErrors = defineErrors('entity-brains', {
    /** Two brain definitions were registered for the same mob. */
    DuplicateBrainMob: 'Duplicate brain mob: {id}',
    /** A test mob was ticked before it was given a brain. Call `attach()` first. */
    NoBrainAttached: '{type} has no brain attached; call attach() first',
    /** A behavior was built with a pitch range whose minimum is above its maximum. */
    MinPitchAboveMax: 'Minimum pitch is larger than maximum pitch! {minPitch} > {maxPitch}',
    /**
     * A behavior read a memory it requires to be present, but the mob does not have it. The
     * behavior's memory requirements are declared wrongly.
     */
    AbsentMemory: '{name} read an absent memory: {memoryName}',
    /**
     * The behavior counts down its interval before looking, so an interval of 1 or less would never
     * wait. Give it a larger interval.
     */
    LookIntervalTooShort: 'SetEntityLookTargetSometimes needs an interval above 1, got {min}'
});
