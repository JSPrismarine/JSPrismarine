import { ByteOrder, NBTReader } from '@jsprismarine/nbt';

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
    // private static readonly legacyToRuntimeId: Map<number, number> = new Map();
    // private static readonly runtimeIdToLegacy: Map<number, number> = new Map();
    // block name -> runtimeId (will not support states for now :(...)
    private static readonly nameToRuntime: Map<string, number> = new Map();
    private static readonly runtimeToName: Map<number, string> = new Map();

    public static initMappings(): void {
        const stream = new BinaryStream(
            BedrockData.canonical_block_states // Vanilla states
        );
        const reader: NBTReader = new NBTReader(stream, ByteOrder.ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(true);

        let runtimeId = 0;

        do {
            const vanillaBlock = reader.parse();
            const vanillaBlockName = vanillaBlock.getString('name', 'unknown');

            const vanillaBlockStates = vanillaBlock.getCompound('states', false);
            if (vanillaBlockStates === null) {
                throw new Error(`Vanilla block=${vanillaBlockName} has no states`);
            }

            // TODO: every block state implementation
            // for (const _ of vanillaBlockStates.entries()) {
            // }

            this.registerMapping(vanillaBlockName, runtimeId++);
        } while (!stream.feof());
    }

    private static registerMapping(name: string, runtimeId: number): void {
        this.nameToRuntime.set(name, runtimeId);
        this.runtimeToName.set(runtimeId, name);
    }

    public static getRuntimeId(name: string): number {
        return this.nameToRuntime.get(name) ?? 0; // Air runtime ID!!
    }

    public static getLegacyId(runtimeId: number): LegacyId {
        const name = this.runtimeToName.get(runtimeId)!;
        const legacyId = BedrockData.block_id_map[name];
        // TODO: proper meta
        return <LegacyId>{ id: legacyId & 0xf, meta: 0 };
    }
}
