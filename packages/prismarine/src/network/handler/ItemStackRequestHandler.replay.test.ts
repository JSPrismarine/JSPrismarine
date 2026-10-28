import { item_table as ItemTable } from '@jsprismarine/bedrock-data';
import { BlockPalette } from '@jsprismarine/blocks';
import type { Logger } from '@jsprismarine/logger';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import CraftingInput from '../../crafting/CraftingInput';
import type { CraftingStation, StationRegistry } from '../../crafting/CraftingStation';
import type { Recipe } from '../../crafting/Recipe';
import type RecipeManager from '../../crafting/RecipeManager';
import ContainerEntry from '../../inventory/ContainerEntry';
import HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import { testContent } from '../../testing/entityServer';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import type DataPacket from '../packet/DataPacket';
import ItemStackRequestPacket from '../packet/ItemStackRequestPacket';
import ItemStackResponsePacket from '../packet/ItemStackResponsePacket';
import type { ItemStackResponse } from '../packet/ItemStackResponsePacket';
import ItemStackRequestHandler from './ItemStackRequestHandler';

/**
 * A session on a Bedrock Dedicated Server 1.26.52.3, recorded through the proxy with the
 * retail client: the inventory at the join, every `ItemStackRequest` the client sent, and the
 * `ItemStackResponse` BDS answered each with. Moving, splitting, merging and swapping stacks,
 * crafting in the inventory's grid and at a table, and putting the grid back on closing it.
 * Drops and blocks placed travel as legacy transactions instead; their `set` lines say what
 * each left in its slot, so the replay holds what BDS held.
 *
 * Recipes are named by BDS's numbers, which this server does not share yet, so each line
 * also says what that number makes; the replay hands the handler that recipe.
 */
const FIXTURE = new URL('./__fixtures__/bds-1.26.52-item-stack-requests.ndjson', import.meta.url);

interface StackLine {
    slot: number;
    name: string;
    count: number;
    meta: number;
    blockRuntimeId: number;
    stackNetworkId: number;
}

// Parsed JSON is a boundary the compiler cannot see; each line is read by its `kind`.
const lines = fs
    .readFileSync(FIXTURE, 'utf8')
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line) as { kind: string } & Record<string, unknown>);

const itemOf = ({ name, count, meta, blockRuntimeId }: Omit<StackLine, 'slot' | 'stackNetworkId'>): Item =>
    new Item({ runtimeId: ItemTable[name]?.runtime_id ?? 0, name, meta, count, blockRuntimeId });

/** A recipe as far as the handler looks at it: its station and what it makes. */
const recipeOf = (line: Record<string, unknown>): Recipe =>
    stub<Recipe>({
        id: String(line.id),
        station: 'crafting_table',
        // Parsed JSON again, written by the fixture builder in this shape.
        getOutputs: () => [itemOf(line.output as StackLine)]
    });

/** An answer as both sides are compared: which request, whether it was accepted, and the slots. */
interface Answer {
    requestId: number;
    result: number;
    containers: Array<{ container: number; slots: Array<{ slot: number; count: number; stackNetworkId: number }> }>;
}

const fromResponse = (response: ItemStackResponse): Answer => ({
    requestId: response.requestId,
    result: response.result,
    containers: response.containers.map(({ container, slots }) => ({
        container: container.containerId,
        slots: slots.map(({ slot, count, itemStackId }) => ({ slot, count, stackNetworkId: itemStackId }))
    }))
});

/**
 * Answers as text, with stack network ids written by what they say rather than by number.
 *
 * Each server picks its own numbers, so a stack the replay started with is written by its BDS
 * id on both sides, and every other id by the order in which it first appeared in that
 * side's answers. Two answers then read the same exactly when the same stacks kept their ids
 * and new ones were made in the same places.
 * @param answers - one side's answers, in order.
 * @param seeded - the starting stacks, by this side's id, to BDS's.
 */
const write = (answers: Answer[], seeded: ReadonlyMap<number, number>): string[] => {
    const order = new Map<number, number>();
    const name = (id: number): string => {
        if (id === 0) return '0';
        const start = seeded.get(id);
        if (start !== undefined) return String(start);
        if (!order.has(id)) order.set(id, order.size + 1);
        return `new${order.get(id)}`;
    };

    return answers.map(
        ({ requestId, result, containers }) =>
            `${requestId} ${result === 0 ? 'OK' : `error ${result}`}` +
            containers
                .map(
                    ({ container, slots }) =>
                        ` ${container}{${slots.map(({ slot, count, stackNetworkId }) => `${slot}:${count}#${name(stackNetworkId)}`).join(' ')}}`
                )
                .join('')
    );
};

/** Replays the recorded requests against this server's handler, from the recorded inventory. */
const replay = async () => {
    const inventory = new HumanInventory();
    // This server's id for each starting stack, to BDS's.
    const seeded = new Map<number, number>();
    const startLine = lines.find((line) => line.kind === 'inventory')!;
    // Parsed JSON: the inventory line's slots are written by the fixture builder in this shape.
    for (const stack of startLine.slots as StackLine[]) {
        const item = itemOf(stack);
        inventory.setItem(stack.slot, new ContainerEntry({ item, count: stack.count }));
        seeded.set(inventory.assignStackNetworkId(item), stack.stackNetworkId);
    }

    const recipes = new Map(
        lines.filter((line) => line.kind === 'recipe').map((line) => [Number(line.netId), recipeOf(line)])
    );
    // The recipe the request last named, which the station then says the grid makes: what is
    // under test is what the handler does with a craft, not which recipe a grid matches.
    let named: Recipe | null = null;
    const content = testContent();
    // The recording uses the legacy recipe manager's ids. Make the content packet build fail
    // as it can at startup, so sendCraftingData and this handler both use that same recipe list.
    const unavailablePayloadContent = {
        ...content,
        blocks: { ...content.blocks, palette: new BlockPalette([]) }
    };
    const server: Server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
        // A finished craft raises `recipe_crafted`, which asks for the server's content.
        getContent: () => unavailablePayloadContent,
        getRecipeManager: () =>
            stub<RecipeManager>({
                getByNetId: (netId: number) => (named = recipes.get(netId) ?? null)
            }),
        getStationRegistry: () =>
            stub<StationRegistry>({
                get: () => stub<CraftingStation>({ match: () => named })
            })
    });

    const sent: DataPacket[] = [];
    const craftingInput = new CraftingInput();
    const world = stub<World>({ dropContents: async () => {} });
    const session = stub<PlayerSession>({
        getOpenBlockContainer: () => undefined,
        getPlayer: () =>
            stub<Player>({
                getInventory: () => inventory,
                getCraftingInput: () => craftingInput,
                getServer: () => server,
                getWorld: () => world,
                getPosition: () => new Position(0, 64, 0, world)
            }),
        send: async (packet) => void sent.push(packet)
    });

    for (const line of lines) {
        if (line.kind === 'set') {
            // A drop or a block placed, which travels as a legacy transaction and not as a
            // request: the slot simply holds less.
            const slot = Number(line.slot);
            const count = Number(line.count);
            const held = inventory.getItem(slot);
            if (count === 0) inventory.removeItem(slot);
            else inventory.setItem(slot, new ContainerEntry({ item: held.withCount(count), count }));
        } else if (line.kind === 'request') {
            const packet = new ItemStackRequestPacket(Buffer.from(String(line.payload), 'base64'));
            packet.decode();
            await new ItemStackRequestHandler().handle(packet, server, session);
        }
    }

    const ours = sent
        .filter((packet): packet is ItemStackResponsePacket => packet instanceof ItemStackResponsePacket)
        .flatMap((packet) => packet.responses.map(fromResponse));
    // Parsed JSON again; the response lines are written by the fixture builder in this shape.
    const theirs = lines.filter((line) => line.kind === 'response') as unknown as Answer[];

    return {
        actual: write(ours, seeded),
        expected: write(theirs, new Map([...seeded.values()].map((id) => [id, id])))
    };
};

describe('ItemStackRequestHandler against a Bedrock Dedicated Server session', () => {
    it('answers every recorded request as BDS did', async () => {
        const { expected, actual } = await replay();

        expect(expected).toHaveLength(69);
        expect(actual).toEqual(expected);
    });
});
