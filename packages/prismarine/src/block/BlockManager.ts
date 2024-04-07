import * as Blocks from './Blocks';

import type { Block } from './Block';
import { BlockIdsType } from './BlockIdsType';
import BlockRegisterEvent from '../events/block/BlockRegisterEvent';
import type Server from '../Server';
import Timer from '../utils/Timer';

export default class BlockManager {
    private readonly server: Server;
    private readonly blocks = new Map();
    private readonly javaBlocks = new Map();

    public constructor(server: Server) {
        this.server = server;
    }

    /**
     * OnEnable hook.
     */
    public async onEnable() {
        await this.importBlocks();
    }

    /**
     * OnDisable hook.
     */
    public async onDisable() {
        this.blocks.clear();
    }

    /**
     * Get block by namespaced ID.
     */
    public getBlock(name: string): Block {
        if (!this.blocks.has(name) && !this.javaBlocks.has(name)) {
            throw new Error(`invalid block with id ${name}`);
        }

        return this.blocks.get(name)! || this.javaBlocks.get(name)!;
    }

    /**
     * Get block by numeric ID.
     */
    public getBlockById(id: number): Block {
        if (!BlockIdsType[id]) {
            throw new Error(`invalid block with numeric id ${id}`);
        }

        return this.getBlocks().find((a) => a.getId() === id && a.meta === 0)!;
    }

    /**
     * Get block by numeric id and meta value.
     */
    public getBlockByIdAndMeta(id: number, meta: number): Block {
        const block = this.getBlocks().find((a) => a.id === id && a.meta === meta);

        if (!block) throw new Error(`invalid block with numeric id ${id}:${meta}`);
        return block;
    }

    /**
     * Get all blocks.
     *
     * @returns all registered blocks.
     */
    public getBlocks(): Block[] {
        return Array.from(this.blocks.values());
    }

    /**
     * Register a block.
     *
     * @param block - The block
     */
    public async registerBlock(block: Block) {
        try {
            this.blocks.get(block.name);
            this.getBlockByIdAndMeta(block.getId(), block.getMeta());

            throw new Error(`Block with id ${block.getName()} (${block.getId()}:${block.getMeta()}) already exists`);
        } catch (error: unknown) {
            if (!(error as any).message.includes('invalid block with ')) throw error;
        }

        const event = new BlockRegisterEvent(block);
        await this.server.getEventManager().emit('blockRegister', event);
        if (event.isCancelled()) return;

        this.server.getLogger()?.debug(`Block with id §b${block.name}§r registered`, 'BlockManager/registerClassBlock');
        this.blocks.set(block.name, block);
        this.javaBlocks.set(block.javaName, block);
    }

    /**
     * Register blocks exported by './Blocks'
     */
    private async importBlocks() {
        const timer = new Timer();

        // Dynamically register blocks
        await Promise.all(Object.entries(Blocks).map(async ([, block]) => this.registerBlock(new block())));

        this.server
            .getLogger()
            ?.verbose(
                `Registered §b${this.blocks.size}§r block(s) (took §e${timer.stop()} ms§r)!`,
                'BlockManager/importBlocks'
            );
    }
}
