import { ByteOrder, NBTReader, NBTTagCompound } from '@jsprismarine/nbt';

import BedrockData from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/jsbinaryutils';

export interface LegacyId {
    id: number;
    meta: number;
}

/**
 * Class used to manage runtime Ids.
 */
export default class BlockMappings {
    private static readonly legacyToRuntimeId: Map<number, number> = new Map();
    private static readonly runtimeIdToLegacy: Map<number, number> = new Map();

    private static runtimeIdAlloc = 0;

    public static async initMappings(): Promise<void> {
        const compound: Set<NBTTagCompound> = await new Promise((resolve) => {
            const reader: NBTReader = new NBTReader(
                new BinaryStream(
                    BedrockData.block_states // Vanilla states
                ),
                ByteOrder.ByteOrder.BIG_ENDIAN
            );
            resolve(reader.parseList());
        });

        compound.forEach((state) => {
            const blockId = state.getNumber('id', -1);
            const meta = state.getShort('data', -1);
            const runtimeId = state.getNumber('runtimeId', -1);
            const legacyId = (blockId << 6) | meta;

            this.registerMapping(runtimeId, legacyId, meta);

            // TODO: blockstates or whatever this is
            /* legacyStates.forEach((legacyState: NBTTagCompound) => {
                this.registerMapping(
                    runtimeId,
                    legacyState.getNumber('id', 0),
                    legacyState.getShort('val', 0)
                );
            }); */
        });
    }

    private static registerMapping(runtimeId: number, legacyId: number, legacyMeta: number): void {
        this.legacyToRuntimeId.set((legacyId << 4) | legacyMeta, runtimeId);
        this.runtimeIdToLegacy.set(runtimeId, (legacyId << 4) | legacyMeta);
    }

    public static getRuntimeId(legacyId: number, legacyMeta: number): number {
        const indexLegacyId = legacyId << 4;
        if (!this.legacyToRuntimeId.has(indexLegacyId | legacyMeta)) {
            if (!this.legacyToRuntimeId.has(indexLegacyId)) {
                // TODO:
            }
            return this.legacyToRuntimeId.get(indexLegacyId)!;
        }
        return this.legacyToRuntimeId.get(indexLegacyId | legacyMeta)!;
    }

    public static getLegacyId(runtimeId: number): LegacyId {
        const hashLegacyId = this.runtimeIdToLegacy.get(runtimeId)!;
        return <LegacyId>{ id: hashLegacyId >> 4, meta: hashLegacyId & 0xf };
    }
}
