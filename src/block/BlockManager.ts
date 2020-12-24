import BinaryStream from '@jsprismarine/jsbinaryutils';
import Block from './Block';
import { BlockIdsType } from './BlockIdsType';
import { ByteOrder } from '../nbt/ByteOrder';
import NBTReader from '../nbt/NBTReader';
import NBTTagCompound from '../nbt/NBTTagCompound';
import Server from '../Server';
import fs from 'fs';
import path from 'path';

const BedrockData = require('@jsprismarine/bedrock-data'); // TODO: convert to import

export default class BlockManager {
    private server: Server;
    private blocks = new Map();
    private runtimeIds: Array<number> = [];
    private blockPalette: Buffer = Buffer.alloc(0);

    private legacyToRuntimeId: Map<number, number> = new Map();
    private runtimeIdToLegacy: Map<number, number> = new Map();
    private runtimeIdAllocator: number = 0;

    constructor(server: Server) {
        this.server = server;
    }

    /**
     * onEnable hook
     */
    public async onEnable() {
        this.importBlocks();
        this.generateRuntimeIds();
        await this.generateBlockPalette();
    }

    /**
     * onDisable hook
     */
    public async onDisable() {
        this.blocks.clear();
    }

    /**
     * Get block by namespaced  id
     */
    public getBlock(name: string): Block | null {
        return this.blocks.get(name) || null;
    }

    /**
     * Get block by numeric id
     */
    public getBlockById(id: number): Block | null {
        if (!BlockIdsType[id]) return null;

        return (
            this.getBlocks().filter(
                (a) => a.getId() === id && a.meta === 0
            )[0] ?? null
        );
    }

    /**
     * Get block by numeric id and damage value
     */
    public getBlockByIdAndMeta(id: number, meta: number): Block | null {
        if (!BlockIdsType[id]) return null;

        return (
            this.getBlocks().filter((a) => a.id === id && a.meta == meta)[0] ||
            null
        );
    }

    /**
     * Get block by runtime id
     */
    public getBlockByRuntimeId(id: number, meta: number = 0): Block | null {
        return this.getBlockByIdAndMeta(this.runtimeIds[id], meta) || null;
    }

    /**
     * Get all blocks
     */
    public getBlocks(): Array<Block> {
        return Array.from(this.blocks.values());
    }

    private async generateBlockPalette() {
        let compound: Set<NBTTagCompound> = await new Promise((resolve) => {
            let data: BinaryStream = new BinaryStream(
                BedrockData.block_states // Vanilla states
            );

            let reader: NBTReader = new NBTReader(
                data,
                ByteOrder.LITTLE_ENDIAN
            );
            resolve(reader.parseList());
        });

        await Promise.all(
            Array.from(compound).map(async (state) => {
                let runtimeId: number = this.runtimeIdAllocator++;
                if (!state.has('LegacyStates')) return false;

                let legacyStates: Set<NBTTagCompound> = state.getList(
                    'LegacyStates',
                    false
                ) as Set<NBTTagCompound>;

                let firstState: NBTTagCompound = legacyStates.values().next()
                    .value;
                let legacyId: number =
                    (firstState.getNumber('id', 0) << 6) |
                    firstState.getShort('val', 0);
                this.runtimeIdToLegacy.set(runtimeId, legacyId);

                await Promise.all(
                    Array.from(legacyStates).map((legacyState) => {
                        let legacyId: number =
                            (legacyState.getNumber('id', 0) << 6) |
                            legacyState.getShort('val', 0);
                        this.legacyToRuntimeId.set(legacyId, runtimeId);
                    })
                );
            })
        );
    }

    // TODO: to clean up
    // Also, block.getRuntimeId() should call this and return the value
    public getRuntimeWithMeta(id: number, meta: number): number {
        let legacyId = (id << 6) | meta;
        let runtimeId = this.legacyToRuntimeId.get(legacyId);
        if (!this.legacyToRuntimeId.has(legacyId)) {
            runtimeId = this.legacyToRuntimeId.get(id << 6);
            if (!this.legacyToRuntimeId.has(id << 6)) {
                runtimeId = this.runtimeIdAllocator++;
                this.legacyToRuntimeId.set(id << 6, runtimeId);
                this.runtimeIdToLegacy.set(runtimeId, id << 6);
            }
        }

        if (typeof runtimeId === 'undefined') return 0;

        return runtimeId;
    }

    public getRuntimeWithId(legacyId: number): number {
        return this.getRuntimeWithMeta(legacyId >> 4, legacyId & 0xf);
    }

    public getBlockPalette(): Buffer {
        return this.blockPalette;
    }

    /**
     * Registers block from block class
     */
    public registerClassBlock(block: Block) {
        // The runtime ID is a unique ID sent with the start-game packet
        // ours is always based on the block's index in the this.blocks map
        // starting from 0.
        this.server
            .getLogger()
            .silly(`Block with id §b${block.name}§r registered`);
        this.blocks.set(block.name, block);
    }

    /**
     * Loops through ./src/block/blocks and register them
     */
    private importBlocks() {
        try {
            const time = Date.now();
            const blocks = fs.readdirSync(path.join(__dirname, 'blocks'));
            blocks.forEach((id: string) => {
                if (id.includes('.test.') || id.includes('.d.ts')) return; // Exclude test files

                const block = require(`./blocks/${id}`).default;
                try {
                    this.registerClassBlock(new block());
                } catch (err) {
                    this.server.getLogger().error(`${id} failed to register!`);
                }
            });
            this.server
                .getLogger()
                .debug(
                    `Registered §b${blocks.length}§r block(s) (took ${
                        Date.now() - time
                    } ms)!`
                );
        } catch (err) {
            this.server.getLogger().error(`Failed to register blocks: ${err}`);
        }
    }

    private generateRuntimeIds() {
        const blocks = this.getBlocks().sort(() => 0.5 - Math.random()); // Randomize runtimeIds to prevent plugin authors (or us) from using it directly.

        for (let i = 0; i < blocks.length; i++) {
            this.runtimeIds.push(blocks[i].getId());
        }
    }
}
