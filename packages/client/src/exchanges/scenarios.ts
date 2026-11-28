/**
 * The exchanges every pinned Bedrock Dedicated Server is captured on and JSPrismarine is replayed
 * against ([the verification plan](../../../../docs/plans/bedrock-version-verification.md)).
 *
 * They run in this order on one connection, so a replay meets the same state as the capture: the
 * screens first, then the death, the respawn that ends it, and last the trip to the Nether. Each
 * builds what it needs with commands, at a place it computes from where the player stands, so a
 * capture does not depend on where a server spawned the player.
 */
import { ClientErrors } from '@jsprismarine/errors/client';
import { Vector3 } from '@jsprismarine/math';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import {
    emptyItemStackDescriptor,
    HandSlot,
    ItemUseActionType,
    PlayerActionPacket,
    PlayerActionType,
    RespawnPacket,
    TransactionType
} from '@jsprismarine/protocol';
import ContainerClosePacket from '@jsprismarine/protocol/bedrock/packet/ContainerClosePacket';
import InventoryTransactionPacket from '@jsprismarine/protocol/bedrock/packet/InventoryTransactionPacket';

import type { ExchangeDriver, ExchangeScenario } from './exchange';

/** How far a player's eyes are above its feet. */
const EYE_HEIGHT = 1.62;

/** The Overworld's and the Nether's `Dimension ID`. */
const NETHER = 1;

/** The block position a packet carries for an action that concerns no block. */
const NO_BLOCK = { x: 0, y: 0, z: 0 };

/** A block position. */
interface BlockAt {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** The block `east` blocks east of the player's feet, on the floor it stands on. */
const besideFeet = ({ world }: ExchangeDriver, east = 2): BlockAt => {
    const eyes = world.getPosition();
    if (eyes === undefined) throw new ClientErrors.ExchangeWithoutPosition({ action: 'build beside' });
    return { x: Math.floor(eyes.x) + east, y: Math.floor(eyes.y - EYE_HEIGHT), z: Math.floor(eyes.z) };
};

/** Places `block` at `at` and waits until the client has been sent it. */
const place = async (driver: ExchangeDriver, at: BlockAt, block: string): Promise<void> => {
    await driver.command(`setblock ${at.x} ${at.y} ${at.z} ${block}`);
    await driver.until(() => driver.world.blockAt(at.x, at.y, at.z) !== undefined, `${block} never reached the client`);
};

/** The client's `Player Position` in a transaction: its eyes. */
const playerPosition = ({ world }: ExchangeDriver): Vector3 => {
    const eyes = world.getPosition();
    if (eyes === undefined) throw new ClientErrors.ExchangeWithoutPosition({ action: 'act from' });
    return new Vector3(eyes.x, eyes.y, eyes.z);
};

/**
 * Right-clicks the top of a block with the empty hotbar slot 0, as a retail client's item use
 * transaction does.
 */
const clickBlock = async (driver: ExchangeDriver, at: BlockAt): Promise<void> => {
    await driver.client.getSession().send(
        new InventoryTransactionPacket({
            legacyRequest: { legacyRequestId: 0, legacySlotChanges: [] },
            transactionType: TransactionType.USE_ITEM,
            inventoryActions: [],
            hand: HandSlot.MAINHAND,
            transactionData: {
                kind: 'useItem',
                actionType: ItemUseActionType.PLACE,
                triggerType: 1,
                blockPosition: new Vector3(at.x, at.y, at.z),
                blockFace: 1,
                hotbarSlot: 0,
                hand: HandSlot.MAINHAND,
                itemInHand: emptyItemStackDescriptor(),
                playerPosition: playerPosition(driver),
                clickPosition: new Vector3(0.5, 1, 0.5),
                blockRuntimeId: driver.world.blockAt(at.x, at.y, at.z) ?? 0,
                clientInteractPrediction: 1,
                clientCooldownState: 0
            }
        })
    );
};

/** Closes whatever screen the server opened, as a client does when its player presses escape. */
const closeScreen = async (driver: ExchangeDriver): Promise<void> => {
    const open = driver.world.getOpenContainer();
    if (open === undefined) return;
    const close = new ContainerClosePacket();
    close.containerId = open.windowId;
    close.containerType = open.type;
    close.serverInitiatedClose = false;
    await driver.client.getSession().send(close);
    await driver.wait(2);
};

/** The fields of a screen's open that both editions decide alike. */
const OPENED = { ContainerOpenPacket: ['windowId', 'containerType', 'containerEntityId'] } as const;

/** A crafting table's screen: the open, and what follows it. */
const openCraftingTable: ExchangeScenario = {
    id: 'open-crafting-table',
    description: 'A player right-clicks a crafting table.',
    subjects: { ...OPENED, InventoryContentPacket: ['windowId', 'containerId', 'items.length'] },
    settleTicks: 10,
    run: async (driver) => {
        const at = besideFeet(driver);
        await place(driver, at, 'minecraft:crafting_table');
        driver.record();
        await clickBlock(driver, at);
        await driver.until(() => driver.world.getOpenContainer() !== undefined, 'the crafting table never opened');
        await driver.wait(5);
        await closeScreen(driver);
        await driver.command(`setblock ${at.x} ${at.y} ${at.z} minecraft:air`);
    }
};

/** A chest's screen: the open, and the stack the chest holds. */
const openChest: ExchangeScenario = {
    id: 'open-chest',
    description: 'A player right-clicks a chest that holds three sticks.',
    subjects: { ...OPENED, InventoryContentPacket: ['windowId', 'containerId', 'items.length'] },
    settleTicks: 10,
    run: async (driver) => {
        const at = besideFeet(driver, 3);
        await place(driver, at, 'minecraft:chest');
        await driver.command(`replaceitem block ${at.x} ${at.y} ${at.z} slot.container 0 minecraft:stick 3`);
        driver.record();
        await clickBlock(driver, at);
        await driver.until(() => driver.world.getOpenContainer() !== undefined, 'the chest never opened');
        await driver.wait(5);
        // A chest that opened without its sticks would make a capture of some other exchange.
        const open = driver.world.getOpenContainer();
        if (open === undefined || driver.world.inventory(open.windowId)[0]?.stackSize !== 3) {
            throw new ClientErrors.ExchangeNeverHappened({
                what: 'the chest never showed its three sticks',
                ticks: '5'
            });
        }
        await closeScreen(driver);
        await driver.command(`setblock ${at.x} ${at.y} ${at.z} minecraft:air`);
    }
};

/** A death: what the server sends the player who died. */
const death: ExchangeScenario = {
    id: 'death-screen',
    description: 'A player is killed by a command and shown the death screen.',
    subjects: {
        RespawnPacket: ['state', 'runtimeEntityId'],
        DeathInfoPacket: ['cause'],
        SetHealthPacket: ['health']
    },
    settleTicks: 20,
    run: async (driver) => {
        driver.record();
        await driver.command(`kill ${driver.name}`);
        await driver.until(
            () => driver.world.getRespawnState() === PlayerRespawnState.SEARCHING_FOR_SPAWN,
            'the death screen never opened'
        );
    }
};

/** The respawn that ends a death: the client's two halves and the server's answers. */
const respawn: ExchangeScenario = {
    id: 'respawn',
    description: 'A dead player readies its respawn and presses the button.',
    subjects: {
        RespawnPacket: ['state', 'runtimeEntityId'],
        SetHealthPacket: ['health'],
        PlayStatusPacket: ['status'],
        ChangeDimensionPacket: ['dimension']
    },
    settleTicks: 20,
    run: async (driver) => {
        // The retail death screen ignores clicks for a moment after it opens.
        await driver.wait(30);
        const runtimeEntityId = driver.client.getStartGame()?.runtimeEntityId ?? 0n;
        driver.record();
        await driver.client.getSession().send(
            new RespawnPacket({
                position: NO_BLOCK,
                state: PlayerRespawnState.CLIENT_READY_TO_SPAWN,
                runtimeEntityId
            })
        );
        await driver.until(
            () => driver.world.getRespawnState() === PlayerRespawnState.READY_TO_SPAWN,
            'the server never said where the player respawns'
        );
        await driver.client.getSession().send(
            new PlayerActionPacket({
                runtimeEntityId,
                action: PlayerActionType.Respawn,
                blockPosition: NO_BLOCK,
                resultPosition: NO_BLOCK,
                blockFace: 0
            })
        );
        await driver.until(() => (driver.world.health() ?? 0) > 0, 'the player never came back to life');
    }
};

/** A change of dimension, by a command, until the loading screen closes. */
const toTheNether: ExchangeScenario = {
    id: 'change-dimension',
    description: 'A command teleports a player into the Nether.',
    subjects: {
        ChangeDimensionPacket: ['dimension', 'respawn'],
        PlayStatusPacket: ['status']
    },
    settleTicks: 20,
    run: async (driver) => {
        driver.record();
        await driver.command(`execute in nether run tp ${driver.name} 0 100 0`);
        await driver.until(
            () => driver.world.getDimension() === NETHER && driver.client.getDimensionChange().getPending() === null,
            'the change into the Nether never finished'
        );
    }
};

/**
 * The console lines a world gets before the client joins, on BDS and JSPrismarine alike, so every
 * run starts from the same spawn and nothing moves on its own: the spawn at the flat world's
 * surface, no spread around it, no day, no weather and no mobs.
 */
export const EXCHANGE_SETUP: readonly string[] = [
    'gamerule doDaylightCycle false',
    'gamerule doWeatherCycle false',
    'gamerule domobspawning false',
    'gamerule spawnradius 0',
    'setworldspawn 0 -60 0'
];

/** Every exchange, in the order a capture and a replay run them. */
export const EXCHANGE_SCENARIOS: readonly ExchangeScenario[] = [
    openChest,
    openCraftingTable,
    death,
    respawn,
    toTheNether
];
