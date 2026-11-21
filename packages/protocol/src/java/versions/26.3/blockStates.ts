/** Java Edition 26.3's block state ids, from its server jar's blocks report. */
import { JavaBlockStates, javaBlockStateRows } from '../javaBlockStates';
import rows from './blockStates.json' with { type: 'json' };

/** Every 26.3 block state's id, by block and property values. */
export const BLOCK_STATES = new JavaBlockStates(javaBlockStateRows(rows));
