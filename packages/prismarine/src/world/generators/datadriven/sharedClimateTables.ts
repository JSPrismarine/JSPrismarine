import { ClimateParameterList, MultiNoiseBiomeSource } from '@jsprismarine/worldgen';

import type { JavaRegistry } from './javaWorldgenData';

/** Builds shared climate search tables for every report document, or leaves workers on local parsing. */
export const shareClimateTables = (
    biomeParameters: JavaRegistry
): ReadonlyMap<string, SharedArrayBuffer> | undefined => {
    if (typeof SharedArrayBuffer === 'undefined' || biomeParameters.size === 0) return undefined;

    const tables = new Map<string, SharedArrayBuffer>();
    try {
        for (const [id, document] of biomeParameters) {
            const source = MultiNoiseBiomeSource.fromJson(document, id);
            if (!(source.parameters instanceof ClimateParameterList)) return undefined;
            tables.set(id, source.parameters.toSharedArrayBuffer());
        }
    } catch {
        // A document this build cannot pack stays on the existing worker-local parser path.
        return undefined;
    }

    return tables;
};
