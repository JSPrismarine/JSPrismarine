import fs from 'fs';
import path, { resolve } from 'path';

import Block from './Block';
import Prismarine from '../Prismarine';
import { BlockIdsType } from './BlockIdsType';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import NBTWriter from '../nbt/NBTWriter';
import { ByteOrder } from '../nbt/ByteOrder';
import NBTTagCompound from '../nbt/NBTTagCompound';
import StringVal from '../nbt/types/StringVal';

export default class BlockManager {
    private server: Prismarine;
    private blocks = new Map();
    private runtimeIds: Array<number> = [];
    private blockPalette: Buffer = Buffer.alloc(0);

    private NAME_TO_STATIC: Map<string, number> = new Map();
    private RUNTIME_TO_STATIC: Map<number, number> = new Map();

    constructor(server: Prismarine) {
        this.server = server;
    }

    /**
     * onEnable hook
     */
    public async onEnable() {
        this.importBlocks();
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
        this.server.getLogger().debug('Checking block palette...');

        try {
            this.blockPalette = await this.server.getCacheManager().getCachedPalette();
            this.server.getLogger().info('Using cached block palette to speed up start up times!');
        } catch {
            this.server.getLogger().info('Computing block palette and caching them...');
    
            let blockPalette: Set<NBTTagCompound> = await new Promise((resolve) => {
                // Don't create useless variables, we also care about performance!
                resolve(
                    NBTTagCompound.readFromFile(
                        __dirname + '/../resources/assets.dat',
                        ByteOrder.BIG_ENDIAN
                    ).getList('blockPalette', false) as Set<NBTTagCompound>
                );
            });

            let knownBlocks: Set<string> = new Set();
            let staticId: number = 0; // Unique block ID
            let runtimeId: number = 0; // Id referred also to variants
            let compounds: Set<NBTTagCompound> = new Set();

            await Promise.all(Array.from(blockPalette).map((compoundEntry) => {
                let compoundData: NBTTagCompound = compoundEntry.getCompound(
                    'block',
                    false
                ) as NBTTagCompound;
                let blockName = compoundData
                    .getValue('name', 'minecraft:air')
                    .getValue(); // TODO: convert to getString() that does this hack for us

                // If we don't already have the block, we increase the unique block ID
                if (!knownBlocks.has(blockName)) {
                    staticId++;
                    knownBlocks.add(blockName);
                }

                // Before because maybe we don't have it in the software and
                // it will not increase if increased the function 'setRuntimeId()'
                runtimeId++;
                this.getBlock(blockName)?.setRuntimeId(runtimeId);

                // Im a little bit sleepy now, i will check conversion later
                this.RUNTIME_TO_STATIC.set(runtimeId, staticId);
                this.NAME_TO_STATIC.set(blockName, staticId);

                let compound: NBTTagCompound = new NBTTagCompound('');
                let block: NBTTagCompound = new NBTTagCompound('block');

                block.addValue('name', new StringVal(blockName));
                block.addValue('states', compoundData.getCompound('states', false));
                compound.addValue('block', block);
                compounds.add(compound);
            }));

            let writtenPalette: BinaryStream = await new Promise((resolve) => {
                let data: BinaryStream = new BinaryStream();
                let writer: NBTWriter = new NBTWriter(
                    data,
                    ByteOrder.LITTLE_ENDIAN
                );
                writer.setUseVarint(true);
                writer.writeList(compounds);
                resolve(data);
            });

            let buffer = writtenPalette.getBuffer();
            await this.server.getCacheManager().putCachedPalette(buffer);
            this.server.getLogger().info('Palette successfully saved into cache!');
            this.blockPalette = buffer;
        }
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
}
