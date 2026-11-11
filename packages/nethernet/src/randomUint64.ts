import { randomBytes } from 'node:crypto';

/** A random unsigned 64-bit integer, as network and connection IDs are. */
export const randomUint64 = (): bigint => randomBytes(8).readBigUInt64BE();
