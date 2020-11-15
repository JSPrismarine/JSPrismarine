import fs from 'fs';
import path from 'path';

import Block from './Block';
import Prismarine from '../Prismarine';
import { BlockIdsType } from './BlockIdsType';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import NBTWriter from '../nbt/NBTWriter';
import { ByteOrder } from '../nbt/ByteOrder';
import NBTTagCompound from '../nbt/NBTTagCompound';

export default class BlockManager {
    private server: Prismarine;
    private blocks = new Map();
    private runtimeIds: Array<number> = [];
    private blockPalette: Buffer = Buffer.alloc(0);

    constructor(server: Prismarine) {
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
            )[0] || null
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
        let palette: BinaryStream = await new Promise((resolve) => {
            let data: BinaryStream = new BinaryStream();
            let writer: NBTWriter = new NBTWriter(
                data,
                ByteOrder.LITTLE_ENDIAN
            );
            writer.setUseVarint(true);

            this.getBlocks()
                .filter((b) => b.meta === 0)
                .map((block) => () => {
                    let tag: NBTTagCompound = new NBTTagCompound('');
                    let nbtBlock: NBTTagCompound = new NBTTagCompound('block');

                    nbtBlock.addValue('name', block.getName());
                    // nbtBlock.addValue('states', block.getNBT());
                    // TODO: finish palette
                });

            resolve(data);
        });

        this.blockPalette = palette.getBuffer();
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
