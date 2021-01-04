import BinaryStream from '@jsprismarine/jsbinaryutils';
import Block from './Block';
import { BlockIdsType } from './BlockIdsType';
import BlockRegisterEvent from '../events/block/BlockRegisterEvent';
import { ByteOrder } from '../nbt/ByteOrder';
import NBTReader from '../nbt/NBTReader';
import NBTTagCompound from '../nbt/NBTTagCompound';
import Server from '../Server';
import fs from 'fs';
import path from 'path';

const BedrockData = require('@jsprismarine/bedrock-data'); // TODO: convert to import

export default class BlockManager {
    private readonly server: Server;
    private readonly blocks: Map<string, Block> = new Map();

    private readonly legacyToRuntimeId: Map<number, number> = new Map();
    private readonly runtimeIdToLegacy: Map<number, number> = new Map();
    private runtimeIdAllocator = 0;

    constructor(server: Server) {
        this.server = server;
    }

    /**
     * OnEnable hook
     */
    public async onEnable() {
        await this.importBlocks();
        await this.generateBlockPalette();
    }

    /**
     * OnDisable hook
     */
    public async onDisable() {
        this.blocks.clear();
    }

    /**
     * Get block by namespaced  id
     */
    public getBlock(name: string): Block {
        if (!this.blocks.has(name)) {
            throw new Error(`invalid block with id ${name}`);
        }
        return this.blocks.get(name)!;
    }

    /**
     * Get block by numeric id
     */
    public getBlockById(id: number): Block {
        if (!BlockIdsType[id]) {
            throw new Error(`invalid block with numeric id ${id}`);
        }

        return this.getBlocks().find((a) => a.getId() === id && a.meta === 0)!;
    }

    /**
     * Get block by numeric id and damage value
     */
    public getBlockByIdAndMeta(id: number, meta: number): Block {
        const block = this.getBlocks().find(
            (a) => a.id === id && a.meta === meta
        );

        if (!block)
            throw new Error(`invalid block with numeric id ${id}:${meta}`);
        return block;
    }

    /**
     * Get block by runtime id
     */
    public getBlockByRuntimeId(runtimeId: number, meta = 0): Block | null {
        if (this.runtimeIdToLegacy.has(runtimeId)) {
            const legacyId = this.runtimeIdToLegacy.get(runtimeId)!;
            return this.getBlockByIdAndMeta(legacyId >> 6, meta);
        }
        console.log(
            'Legacy ID mapping for Runtime ID=%d not found!',
            runtimeId
        );
        return null;
    }

    /**
     * Get all blocks
     */
    public getBlocks(): Block[] {
        return Array.from(this.blocks.values());
    }

    private async generateBlockPalette() {
        const compound: Set<NBTTagCompound> = await new Promise((resolve) => {
            const data: BinaryStream = new BinaryStream(
                BedrockData.block_states // Vanilla states
            );

            const reader: NBTReader = new NBTReader(
                data,
                ByteOrder.LITTLE_ENDIAN
            );
            resolve(reader.parseList());
        });

        await Promise.all(
            Array.from(compound).map(async (state) => {
                const runtimeId: number = this.runtimeIdAllocator++;
                if (!state.has('LegacyStates')) return false;

                const legacyStates: Set<NBTTagCompound> = state.getList(
                    'LegacyStates',
                    false
                ) as Set<NBTTagCompound>;

                const firstState: NBTTagCompound = legacyStates.values().next()
                    .value;
                const legacyId: number =
                    (firstState.getNumber('id', 0) << 6) |
                    firstState.getShort('val', 0);
                this.runtimeIdToLegacy.set(runtimeId, legacyId);

                Array.from(legacyStates).forEach((legacyState) => {
                    const legacyId: number =
                        (legacyState.getNumber('id', 0) << 6) |
                        legacyState.getShort('val', 0);
                    this.legacyToRuntimeId.set(legacyId, runtimeId);
                });
            })
        );
    }

    // TODO: to clean up
    // Also, block.getRuntimeId() should call this and return the value
    public getRuntimeWithMeta(id: number, meta: number): number {
        const legacyId = (id << 6) | meta;
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

    /**
     * Registers block from block class
     */
    public async registerClassBlock(block: Block) {
        try {
            this.blocks.get(block.name);
            this.getBlockByIdAndMeta(block.getId(), block.getMeta());

            throw new Error(
                `Block with id ${block.getName()} (${block.getId()}:${block.getMeta()}) already exists`
            );
        } catch (error) {
            if (!error.message.includes('invalid block with ')) throw error;
        }

        const event = new BlockRegisterEvent(block);
        await this.server.getEventManager().emit('blockRegister', event);
        if (event.cancelled) return;

        // The runtime ID is a unique ID sent with the start-game packet
        // ours is always based on the block's index in the this.blocks map
        // starting from 0.
        this.server
            .getLogger()
            .silly(
                `Block with id §b${block.name}§r registered`,
                'BlockManager/registerClassBlock'
            );
        this.blocks.set(block.name, block);
    }

    /**
     * Loops through ./src/block/blocks and register them
     */
    private async importBlocks() {
        try {
            const time = Date.now();
            const blocks = fs.readdirSync(path.join(__dirname, 'blocks'));
            await Promise.all(
                blocks.map(async (id: string) => {
                    if (
                        id.includes('.test.') ||
                        id.includes('.d.ts') ||
                        id.includes('.map')
                    )
                        return; // Exclude test files

                    const block = require(`./blocks/${id}`).default;
                    try {
                        await this.registerClassBlock(new block());
                    } catch {
                        this.server
                            .getLogger()
                            .error(
                                `${id} failed to register!`,
                                'BlockManager/importBlocks'
                            );
                    }
                })
            );
            this.server
                .getLogger()
                .debug(
                    `Registered §b${blocks.length}§r block(s) (took ${
                        Date.now() - time
                    } ms)!`,
                    'BlockManager/importBlocks'
                );
        } catch (error) {
            this.server
                .getLogger()
                .error(
                    `Failed to register blocks: ${error}`,
                    'BlockManager/importBlocks'
                );
        }
    }
}
