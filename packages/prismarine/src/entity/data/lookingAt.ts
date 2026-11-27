/**
 * Java's `LivingEntity.isLookingAtMe`, which decides an enderman's stare and a creaking's freeze:
 * whether a player's look points at one of a few heights on an entity, closely enough and with
 * nothing in the way.
 *
 * @javaSee LivingEntity.isLookingAtMe
 */
import type { EntityPosition } from '@jsprismarine/entities';

/** A look, as a player sends its head's yaw and pitch, in degrees. */
export interface Look {
    readonly yaw: number;
    readonly pitch: number;
}

/**
 * Java's `Entity.calculateViewVector`: the unit vector a yaw and pitch point along. Bedrock's yaw
 * and pitch are Java's, so the same formula reads either.
 *
 * @javaSource Entity.calculateViewVector
 */
export const viewVector = ({ yaw, pitch }: Look): EntityPosition => {
    const pitchRadians = (pitch * Math.PI) / 180;
    const yawRadians = (-yaw * Math.PI) / 180;
    return {
        x: Math.sin(yawRadians) * Math.cos(pitchRadians),
        y: -Math.sin(pitchRadians),
        z: Math.cos(yawRadians) * Math.cos(pitchRadians)
    };
};

/** One `isLookingAtMe` question. */
export interface LookingAtQuery {
    /** Where the looker's eyes are. */
    readonly eye: EntityPosition;
    readonly look: Look;
    /** The entity's horizontal position, which every height is measured above. */
    readonly at: EntityPosition;
    /** The heights on the entity the look may land on. */
    readonly heights: readonly number[];
    /** The most `1 - cos` of the angle between the look and the line to a height. */
    readonly tolerance: number;
    /** Whether the tolerance is divided by the distance. */
    readonly scaleByDistance: boolean;
    /** Whether nothing blocks the line from the eyes to a point. */
    readonly clear: (from: EntityPosition, to: EntityPosition) => boolean;
}

/**
 * Java's `LivingEntity.isLookingAtMe`: true when, for one of the heights, the cosine between the
 * look and the line from the eyes to that point is above `1 - tolerance` (the tolerance over the
 * distance when it scales) and nothing blocks the line.
 *
 * @javaSource LivingEntity.isLookingAtMe
 */
export const isLookingAt = (query: LookingAtQuery): boolean => {
    const view = viewVector(query.look);
    const viewLength = Math.hypot(view.x, view.y, view.z) || 1;
    for (const height of query.heights) {
        const to = { x: query.at.x - query.eye.x, y: height - query.eye.y, z: query.at.z - query.eye.z };
        const length = Math.hypot(to.x, to.y, to.z);
        if (length === 0) continue;
        const dot = (view.x * to.x + view.y * to.y + view.z * to.z) / (viewLength * length);
        const threshold = 1 - query.tolerance / (query.scaleByDistance ? length : 1);
        if (dot > threshold && query.clear(query.eye, { x: query.at.x, y: height, z: query.at.z })) return true;
    }
    return false;
};
