import Block from './Block';
import { BlockIdsType } from './BlockIdsType';
import BlockRegisterEvent from '../events/block/BlockRegisterEvent';
import Server from '../Server';
import fs from 'fs';
import path from 'path';

export default class BlockManager {
    private readonly server: Server;
    private readonly blocks = new Map();

    public constructor(server: Server) {
        this.server = server;
    }

    /**
     * OnEnable hook
     */
    public async onEnable() {
        await this.importBlocks();
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
        const block = this.getBlocks().find((a) => a.id === id && a.meta === meta);

        if (!block) throw new Error(`invalid block with numeric id ${id}:${meta}`);
        return block;
    }

    /**
     * Get all blocks
     */
    public getBlocks(): Block[] {
        return Array.from(this.blocks.values());
    }

    /**
     * Registers block from block class
     */
    public async registerClassBlock(block: Block) {
        try {
            this.blocks.get(block.name);
            this.getBlockByIdAndMeta(block.getId(), block.getMeta());

            throw new Error(`Block with id ${block.getName()} (${block.getId()}:${block.getMeta()}) already exists`);
        } catch (error) {
            if (!error.message.includes('invalid block with ')) throw error;
        }

        const event = new BlockRegisterEvent(block);
        await this.server.getEventManager().emit('blockRegister', event);
        if (event.cancelled) return;

        this.server.getLogger().silly(`Block with id §b${block.name}§r registered`, 'BlockManager/registerClassBlock');
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
                    if (id.includes('.test.') || id.includes('.d.ts') || id.includes('.map')) {
                        return; // Exclude test files
                    }

                    const block = require(`./blocks/${id}`).default;
                    try {
                        await this.registerClassBlock(new block());
                    } catch {
                        this.server.getLogger().error(`${id} failed to register!`, 'BlockManager/importBlocks');
                    }
                })
            );
            this.server
                .getLogger()
                .debug(
                    `Registered §b${this.blocks.size}§r block(s) (took ${Date.now() - time} ms)!`,
                    'BlockManager/importBlocks'
                );
        } catch (error) {
            this.server.getLogger().error(`Failed to register blocks: ${error}`, 'BlockManager/importBlocks');
        }
    }
}
