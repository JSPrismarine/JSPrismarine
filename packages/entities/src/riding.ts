/**
 * What `minecraft:rideable` declares, and the guard the entity reads it back
 * with.
 *
 * The parsed shape lives here rather than beside the component factory so
 * {@link EntityInstance.mount} can check a seat without importing the
 * component module.
 */

/** One seat of `minecraft:rideable`. */
export interface RideableSeat {
    /** Where the rider sits, relative to the vehicle, in blocks. */
    readonly position: readonly [number, number, number];
    /** The rider count at which this seat starts being used. */
    readonly minRiderCount: number;
    readonly maxRiderCount: number;
    /** How far the rider may turn from the seat's facing, in degrees. */
    readonly lockRiderRotation: number;
    /** A literal angle or a Molang expression, which the boat writes. */
    readonly rotateRiderBy?: number | string;
}

/** What `minecraft:rideable` declares. */
export interface RideableParams {
    /** How many riders fit, which is what caps the seats. */
    readonly seatCount: number;
    /** Written as one object in 50 vanilla instances and an array in 17. */
    readonly seats: readonly RideableSeat[];
    /** The type families allowed to ride; empty means any. */
    readonly familyTypes: readonly string[];
    readonly interactText?: string;
    readonly crouchingSkipInteract: boolean;
    readonly pullInEntities: boolean;
    /** Fired on the vehicle when a rider takes a seat. */
    readonly onRiderEnterEvent?: string;
    /** Fired on the vehicle when a rider leaves. */
    readonly onRiderExitEvent?: string;
}

/** Whether a value is the parsed body of `minecraft:rideable`. */
export const isRideableParams = (value: unknown): value is RideableParams =>
    typeof value === 'object' &&
    value !== null &&
    'seatCount' in value &&
    typeof value.seatCount === 'number' &&
    'familyTypes' in value &&
    Array.isArray(value.familyTypes);
