/** The scenario suites a run chooses from, each one server and client the runner starts. */
import type { Scenario } from './scenario.mts';
import { permissionsReload } from './scenarios/permissions-reload.mts';
import { scriptClientFeedback } from './scenarios/script-client-feedback.mts';
import { miningDrops } from './scenarios/mining-drops.mts';
import { itemDropPickup } from './scenarios/item-drop-pickup.mts';
import { experienceOrbs } from './scenarios/experience-orbs.mts';
import { dripstone } from './scenarios/dripstone.mts';
import { wallPlacement } from './scenarios/wall-placement.mts';
import { farmland } from './scenarios/farmland.mts';
import { chest } from './scenarios/chest.mts';
import { furnace } from './scenarios/furnace.mts';
import { villagerTrade } from './scenarios/villager-trade.mts';
import { glassBottleFilling, liquidContainers } from './scenarios/liquid-containers.mts';
import { eating } from './scenarios/eating.mts';
import { litFurnace } from './scenarios/lit-furnace.mts';
import { recipeBook } from './scenarios/recipe-book.mts';
import { jump } from './scenarios/jump.mts';
import { gait } from './scenarios/gait.mts';
import { lookDirection } from './scenarios/look-direction.mts';
import { playerKnockback } from './scenarios/player-knockback.mts';
import { fallDamage } from './scenarios/fall-damage.mts';
import { blockPlacement } from './scenarios/block-placement.mts';
import { leverLamp } from './scenarios/lever-lamp.mts';
import { attackEntity } from './scenarios/attack-entity.mts';
import { movement } from './scenarios/movement.mts';
import { movementFanout } from './scenarios/movement-fanout.mts';
import { movementRotation } from './scenarios/movement-rotation.mts';
import { placementOverlap } from './scenarios/placement-overlap.mts';
import { spawn } from './scenarios/spawn.mts';
import { explorerMap } from './scenarios/explorer-map.mts';
import { kick } from './scenarios/kick.mts';
import { enderDragon } from './scenarios/ender-dragon.mts';
import { cachedChunkDelivery } from './scenarios/cached-chunk-delivery.mts';
import { subChunkRequestDelivery } from './scenarios/subchunk-request-delivery.mts';
import { keepAlive } from './scenarios/keep-alive.mts';
import { resourcePackDownload } from './scenarios/resource-pack-download.mts';

export interface ScenarioSuite {
    name: string;
    scenarios: Scenario[];
}

export const suites: ScenarioSuite[] = [
    // The gameplay scenarios, in four suites so CI can play them on four runners at once. Each
    // suite starts on a fresh world, and keeps the order its scenarios had when they were one.
    {
        name: 'chunks-movement-and-death',
        scenarios: [cachedChunkDelivery, subChunkRequestDelivery, spawn, movement, jump, attackEntity, leverLamp]
    },
    {
        name: 'damage-and-sessions',
        scenarios: [
            blockPlacement,
            fallDamage,
            playerKnockback,
            lookDirection,
            gait,
            movementFanout,
            movementRotation,
            permissionsReload
        ]
    },
    {
        name: 'scripts-and-items',
        scenarios: [scriptClientFeedback, miningDrops, itemDropPickup, experienceOrbs]
    },
    {
        name: 'containers-and-dimensions',
        scenarios: [
            furnace,
            chest,
            litFurnace,
            villagerTrade,
            eating,
            liquidContainers,
            glassBottleFilling,
            recipeBook,
            placementOverlap,
            enderDragon,
            dripstone,
            wallPlacement,
            // Last, because it reshapes the terrain it runs on - tilled ground, planted wheat
            // and a water source stay behind - and nothing should have to play on top of that.
            farmland
        ]
    },
    { name: 'worldgen-spawn', scenarios: [explorerMap] },
    // Its own suite: a kicked client is gone, so nothing can run after it.
    { name: 'kick', scenarios: [kick] },
    // On its own: the short interval it runs with would drop the client of a scenario that stalls
    // the server for longer than one interval.
    { name: 'keep-alive', scenarios: [keepAlive] },
    // On its own: the pack it installs is required, so every client joining its server downloads it.
    { name: 'resource-packs', scenarios: [resourcePackDownload] }
];
