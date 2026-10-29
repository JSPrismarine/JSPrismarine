import type { Vector3 } from '@jsprismarine/math';
import type { NBTTagCompound } from '@jsprismarine/nbt';

/**
 * One durable change to a world's content, spelled in the world's own vocabulary.
 *
 * The world-change stream: everything that rewrites what a world holds leaves it as one of
 * these, through {@link import('./WorldChangeSink').WorldChangeSink.worldChanged}. The kinds
 * are exactly what the world emits today - a block becoming something else, a block entity's
 * data being rewritten - and a new kind is added when the world gains something new to say,
 * not in anticipation of it.
 *
 * Deliberately free of wire types. What a change becomes on a connection - which packet,
 * which flags, who is near enough to receive it - is the replication layer's business, so a
 * subscriber that is not a network (a recorder, a test) can read the stream without knowing
 * the protocol exists.
 */
export type WorldChange =
    | {
          /** A block is now something other than what it was. */
          readonly kind: 'block-set';
          /** Where the block is. */
          readonly position: Vector3;
          /** What it is now. */
          readonly blockRuntimeId: number;
      }
    | {
          /**
           * A block entity's data is not what it was: a sign's text, a chest's contents, a
           * lectern's page, a flower pot's plant.
           */
          readonly kind: 'block-entity-set';
          /** The block the block entity sits in. */
          readonly position: Vector3;
          /** Its complete data, as the chunk would serialize it. */
          readonly tags: NBTTagCompound;
      };
