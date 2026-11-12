/** The scenario suites a run chooses from, each one server and client the runner starts. */
import type { Scenario } from './scenario.mts';
import { chat } from './scenarios/chat.mts';
import { spectatorPickup } from './scenarios/spectator-pickup.mts';
import { miningDrops } from './scenarios/mining-drops.mts';
import { itemDropPickup } from './scenarios/item-drop-pickup.mts';
import { farmland } from './scenarios/farmland.mts';
import { furnace } from './scenarios/furnace.mts';
import { villagerTrade } from './scenarios/villager-trade.mts';
import { glassBottleFilling, liquidContainers } from './scenarios/liquid-containers.mts';
import { eating } from './scenarios/eating.mts';
import { litFurnace } from './scenarios/lit-furnace.mts';
import { recipeBook } from './scenarios/recipe-book.mts';
import { jump } from './scenarios/jump.mts';
import { gait } from './scenarios/gait.mts';
import { lookDirection } from './scenarios/look-direction.mts';
import { damage } from './scenarios/damage.mts';
import { playerKnockback } from './scenarios/player-knockback.mts';
import { fallDamage } from './scenarios/fall-damage.mts';
import { title } from './scenarios/title.mts';
import { blockPlacement } from './scenarios/block-placement.mts';
import { deathRespawn } from './scenarios/death-respawn.mts';
import { teleportWhileDead } from './scenarios/teleport-while-dead.mts';
import { spawnpointRespawn } from './scenarios/spawnpoint-respawn.mts';
import { summonEntity } from './scenarios/summon-entity.mts';
import { pistonBedrock } from './scenarios/piston-bedrock.mts';
import { leverLamp } from './scenarios/lever-lamp.mts';
import { attackEntity } from './scenarios/attack-entity.mts';
import { movement } from './scenarios/movement.mts';
import { movementFanout } from './scenarios/movement-fanout.mts';
import { frozenWorld } from './scenarios/frozen-world.mts';
import { duplicateLogin } from './scenarios/duplicate-login.mts';
import { rejoin } from './scenarios/rejoin.mts';
import { movementRotation } from './scenarios/movement-rotation.mts';
import { naturalSpawnPlacement } from './scenarios/natural-spawn-placement.mts';
import { naturalSpawnUnderCanopy } from './scenarios/natural-spawn-under-canopy.mts';
import { placementOverlap } from './scenarios/placement-overlap.mts';
import { spawn } from './scenarios/spawn.mts';
import { subChunkBlockChanges } from './scenarios/sub-chunk-block-changes.mts';
import { worldgenSpawn } from './scenarios/worldgen-spawn.mts';
import { levelIsolation } from './scenarios/level-isolation.mts';
import { kick } from './scenarios/kick.mts';
import { teleport } from './scenarios/teleport.mts';
import { edgeChunkBlockChange } from './scenarios/edge-chunk-block-change.mts';
import { dimensionsScenario } from './scenarios/dimensions.mts';
import { enderDragon } from './scenarios/ender-dragon.mts';
import { chunkCompletionReadiness } from './scenarios/chunk-completion-readiness.mts';
import { cachedChunkDelivery } from './scenarios/cached-chunk-delivery.mts';
import { subChunkRequestDelivery } from './scenarios/subchunk-request-delivery.mts';

export interface ScenarioSuite {
    name: string;
    scenarios: Scenario[];
}

export const suites: ScenarioSuite[] = [
    {
        name: 'gameplay-and-dimensions',
        scenarios: [
            cachedChunkDelivery,
            subChunkRequestDelivery,
            spawn,
            chunkCompletionReadiness,
            movement,
            jump,
            attackEntity,
            leverLamp,
            pistonBedrock,
            summonEntity,
            deathRespawn,
            teleportWhileDead,
            blockPlacement,
            title,
            fallDamage,
            damage,
            playerKnockback,
            lookDirection,
            gait,
            movementFanout,
            frozenWorld,
            duplicateLogin,
            rejoin,
            movementRotation,
            chat,
            miningDrops,
            spectatorPickup,
            itemDropPickup,
            edgeChunkBlockChange,
            subChunkBlockChanges,
            teleport,
            furnace,
            litFurnace,
            villagerTrade,
            eating,
            liquidContainers,
            glassBottleFilling,
            recipeBook,
            placementOverlap,
            enderDragon,
            dimensionsScenario,
            spawnpointRespawn,
            // Last, because it reshapes the terrain it runs on - tilled ground, planted wheat
            // and a water source stay behind - and nothing should have to play on top of that.
            farmland
        ]
    },
    // Natural spawning needs its own content fixture so roaming cows cannot affect gameplay checks.
    // The canopy one runs last: it roofs the world over, and nothing after it would see the sky.
    { name: 'natural-spawn', scenarios: [naturalSpawnPlacement, naturalSpawnUnderCanopy] },
    { name: 'worldgen-spawn', scenarios: [worldgenSpawn] },
    // Its own suite, because the second level is a world every other scenario would also tick.
    { name: 'levels', scenarios: [levelIsolation] },
    // Its own suite: a kicked client is gone, so nothing can run after it.
    { name: 'kick', scenarios: [kick] }
];
