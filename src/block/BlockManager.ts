import Block from './Block';
import { BlockIdsType } from './BlockIdsType';
import BlockRegisterEvent from '../events/block/BlockRegisterEvent';
import { ByteOrder } from '../nbt/ByteOrder';
import NBTReader from '../nbt/NBTReader';
import NBTTagCompound from '../nbt/NBTTagCompound';
import R12ToCurrentBlockMapEntry from './R12ToCurrentBlockMapEntry';
import Server from '../Server';
import fs from 'fs';
import path from 'path';

export default class BlockManager {
    private readonly server: Server;
    private readonly blocks: Map<string, Block> = new Map();
    private readonly runtimeIds: number[] = [];
    private readonly blockPalette: Buffer = Buffer.alloc(0);

    private bedrockKnownStates: NBTTagCompound[] = [];
    private readonly legacyToRuntimeId: Map<number, number> = new Map();
    private readonly runtimeIdToLegacy: Map<number, number> = new Map();

    constructor(server: Server) {
        this.server = server;
    }

    /**
     * OnEnable hook
     */
    public async onEnable() {
        await this.importBlocks();
        await this.generateBlockPalette();
        this.generateRuntimeIds();
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
     * Get all blocks
     */
    public getBlocks(): Block[] {
        return Array.from(this.blocks.values());
    }

    private async generateBlockPalette() {
        this.bedrockKnownStates = await new Promise((resolve) => {
            const data: BinaryStream = new BinaryStream(
                BedrockData.canonical_block_states // Vanilla states
            );

            const list: NBTTagCompound[] = [];
            while (!data.feof()) {
                const reader: NBTReader = new NBTReader(
                    data,
                    ByteOrder.LITTLE_ENDIAN
                );
                reader.setUseVarint(true);

                list.push(reader.parse());
            }

            resolve(list);
        });

        const legacyStateMap: R12ToCurrentBlockMapEntry[] = await new Promise(
            (resolve) => {
                const data: BinaryStream = new BinaryStream(
                    BedrockData.r12_to_current_block_map
                );

                const reader: NBTReader = new NBTReader(
                    data,
                    ByteOrder.LITTLE_ENDIAN
                );
                reader.setUseVarint(true);

                const list: R12ToCurrentBlockMapEntry[] = [];
                while (!data.feof()) {
                    const id: string = data
                        .read(data.readUnsignedVarInt())
                        .toString('utf8'); // readString
                    const meta: number = data.readLShort();

                    const state: NBTTagCompound = reader.parse();

                    list.push(new R12ToCurrentBlockMapEntry(id, meta, state));
                }

                resolve(list);
            }
        );

        const idToStatesMap: Map<string, number[]> = new Map<
            string,
            number[]
        >();

        for (let k = 0; k < this.bedrockKnownStates.length; k++) {
            const name: string = this.bedrockKnownStates[k].getString(
                'name',
                ''
            );

            if (!idToStatesMap.has(name)) {
                idToStatesMap.set(name, [k]);
            } else {
                idToStatesMap.get(name)!.push(k);
            }
        }

        for (const pair of legacyStateMap) {
            const id: number = BedrockData.block_id_map[pair.getId()];
            const meta: number = pair.getMeta();

            if (meta > 15) {
                // We can't handle metadata with more than 4 bits
                continue;
            }

            const mappedState: NBTTagCompound = pair.getBlockState();
            const mappedName: string = mappedState.getString('name', '');
            if (!idToStatesMap.has(mappedName)) {
                throw new Error(
                    `${mappedName} does not appear in network table`
                );
            }

            for (const runtimeId of idToStatesMap.get(mappedName)!) {
                const networkState = this.bedrockKnownStates[runtimeId];

                if (mappedState.equals(networkState)) {
                    this.legacyToRuntimeId.set((id << 4) | meta, runtimeId);
                    this.runtimeIdToLegacy.set(runtimeId, (id << 4) | meta);
                }
            }
        }
    }

    // TODO: to clean up
    // Also, block.getRuntimeId() should call this and return the value
    public getRuntimeWithMeta(id: number, meta: number): number {
        let runtimeId = this.legacyToRuntimeId.get((id << 4) | meta);
        if (!this.legacyToRuntimeId.has((id << 4) | meta)) {
            runtimeId = this.legacyToRuntimeId.get(id << 4);
            if (!this.legacyToRuntimeId.has(id << 4)) {
                runtimeId = this.legacyToRuntimeId.get(
                    BlockIdsType.InfoUpdate << 4
                );
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
                    `Registered §b${this.blocks.size}§r block(s) (took ${
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
