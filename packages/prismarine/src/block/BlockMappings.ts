import type { NBTTagCompound } from '@jsprismarine/nbt';
import { ByteOrder, NBTReader } from '@jsprismarine/nbt';

import * as BedrockData from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import { gunzipSync } from 'zlib';
import type Server from '../Server';

export interface LegacyId {
    id: number;
    meta: number;
}

/**
 * Class used to manage runtime Ids.
 */
export class BlockMappings {
    // private static readonly legacyToRuntimeId: Map<number, number> = new Map();
    // private static readonly runtimeIdToLegacy: Map<number, number> = new Map();
    // block name -> runtimeId (will not support states for now :(...)
    private static readonly nameToRuntime: Map<string, number> = new Map();
    private static readonly runtimeToName: Map<number, string> = new Map();

    public static async initMappings(server: Server) {
        try {
            const stream = new BinaryStream(
                gunzipSync(BedrockData.canonical_block_states) // Vanilla states
            );
            const reader: NBTReader = new NBTReader(stream, ByteOrder.BIG_ENDIAN);

            for (const blockTag of reader.parseList<NBTTagCompound>()) {
                const name = blockTag.getString('name', 'minecraft:air');
                const runtimeId = blockTag.getNumber('runtimeId', 0); // TODO: Air runtime ID
                this.registerMapping(name, runtimeId);
            }
        } catch (error: unknown) {
            server.getLogger().error('Failed to load block mappings');
            server.getLogger().error(error);
        }
    }

    private static registerMapping(name: string, runtimeId: number): void {
        this.nameToRuntime.set(name, runtimeId);
        this.runtimeToName.set(runtimeId, name);
    }

    public static getRuntimeId(name: string | undefined | null): number {
        return name ? this.nameToRuntime.get(name)! : 0; // TODO: Air runtime ID
    }

    public static getLegacyId(runtimeId: number): LegacyId {
        const name = this.runtimeToName.get(runtimeId)!;
        const legacyId = (BedrockData as any).block_id_map[name] as number;
        // TODO: proper meta
        return <LegacyId>{ id: legacyId & 0xf, meta: 0 };
    }
}
