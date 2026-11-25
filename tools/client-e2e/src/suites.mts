/** The scenario suites a run chooses from, each one server and client the runner starts. */
import type { Scenario } from './scenario.mts';
import { chat } from './scenarios/chat.mts';
import { commandSyntaxError } from './scenarios/command-syntax-error.mts';
import { permissionsReload } from './scenarios/permissions-reload.mts';
import { scriptForm } from './scenarios/script-form.mts';
import { scriptClientFeedback } from './scenarios/script-client-feedback.mts';
import { scriptRotation } from './scenarios/script-rotation.mts';
import { scriptTeleport } from './scenarios/script-teleport.mts';
import { scriptCustomCommand } from './scenarios/script-custom-command.mts';
import { scriptWorldMessage } from './scenarios/script-world-message.mts';
import { spectatorPickup } from './scenarios/spectator-pickup.mts';
import { miningDrops } from './scenarios/mining-drops.mts';
import { itemDropPickup } from './scenarios/item-drop-pickup.mts';
import { experienceOrbs } from './scenarios/experience-orbs.mts';
import { itemRestShape } from './scenarios/item-rest-shape.mts';
import { fallingBlockWater } from './scenarios/falling-block-water.mts';
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
import { damage } from './scenarios/damage.mts';
import { playerKnockback } from './scenarios/player-knockback.mts';
import { fallDamage } from './scenarios/fall-damage.mts';
import { title } from './scenarios/title.mts';
import { blockPlacement } from './scenarios/block-placement.mts';
import { deathInventory } from './scenarios/death-inventory.mts';
import { deathRespawn } from './scenarios/death-respawn.mts';
import { teleportWhileDead } from './scenarios/teleport-while-dead.mts';
import { spawnpointRespawn } from './scenarios/spawnpoint-respawn.mts';
import { summonEntity } from './scenarios/summon-entity.mts';
import { fillReplaceFilter } from './scenarios/fill-replace-filter.mts';
import { mobLeavesBlock } from './scenarios/mob-leaves-block.mts';
import { summonRefused } from './scenarios/summon-refused.mts';
import { pistonBedrock } from './scenarios/piston-bedrock.mts';
import { leverLamp } from './scenarios/lever-lamp.mts';
import { pressurePlateLamp } from './scenarios/pressure-plate-lamp.mts';
import { attackEntity } from './scenarios/attack-entity.mts';
import { movement } from './scenarios/movement.mts';
import { movementFanout } from './scenarios/movement-fanout.mts';
import { frozenWorld } from './scenarios/frozen-world.mts';
import { duplicateLogin } from './scenarios/duplicate-login.mts';
import { rejoin } from './scenarios/rejoin.mts';
import { playerProperties } from './scenarios/player-properties.mts';
import { movementRotation } from './scenarios/movement-rotation.mts';
import { naturalSpawnPlacement } from './scenarios/natural-spawn-placement.mts';
import { naturalSpawnUnderCanopy } from './scenarios/natural-spawn-under-canopy.mts';
import { placementOverlap } from './scenarios/placement-overlap.mts';
import { spawn } from './scenarios/spawn.mts';
import { subChunkBlockChanges } from './scenarios/sub-chunk-block-changes.mts';
import { generatedFluidFlow } from './scenarios/generated-fluid-flow.mts';
import { worldgenSpawn } from './scenarios/worldgen-spawn.mts';
import { explorerMap } from './scenarios/explorer-map.mts';
import { worldgenDimensions } from './scenarios/worldgen-dimensions.mts';
import { levelTransfer } from './scenarios/level-transfer.mts';
import { levelIsolation } from './scenarios/level-isolation.mts';
import { secondLevelSummon } from './scenarios/second-level-summon.mts';
import { kick } from './scenarios/kick.mts';
import { teleport } from './scenarios/teleport.mts';
import { edgeChunkBlockChange } from './scenarios/edge-chunk-block-change.mts';
import { dimensionsScenario } from './scenarios/dimensions.mts';
import { enderDragon } from './scenarios/ender-dragon.mts';
import { chunkCompletionReadiness } from './scenarios/chunk-completion-readiness.mts';
import { cachedChunkDelivery } from './scenarios/cached-chunk-delivery.mts';
import { subChunkRequestDelivery } from './scenarios/subchunk-request-delivery.mts';
import { tpsBar } from './scenarios/tps-bar.mts';
import { multiverse } from './scenarios/multiverse.mts';
import { tabList } from './scenarios/tab-list.mts';

export interface ScenarioSuite {
    name: string;
    scenarios: Scenario[];
}

export const suites: ScenarioSuite[] = [
    // The gameplay scenarios, in four suites so CI can play them on four runners at once. Each
    // suite starts on a fresh world, and keeps the order its scenarios had when they were one.
    {
        name: 'chunks-movement-and-death',
        scenarios: [
            cachedChunkDelivery,
            subChunkRequestDelivery,
            spawn,
            chunkCompletionReadiness,
            movement,
            jump,
            attackEntity,
            leverLamp,
            pressurePlateLamp,
            pistonBedrock,
            summonEntity,
            summonRefused,
            fillReplaceFilter,
            mobLeavesBlock,
            deathRespawn,
            deathInventory,
            teleportWhileDead
        ]
    },
    {
        name: 'damage-and-sessions',
        scenarios: [
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
            playerProperties,
            movementRotation,
            chat,
            commandSyntaxError,
            permissionsReload
        ]
    },
    {
        name: 'scripts-and-items',
        scenarios: [
            scriptWorldMessage,
            scriptCustomCommand,
            scriptForm,
            scriptTeleport,
            scriptRotation,
            scriptClientFeedback,
            tpsBar,
            tabList,
            multiverse,
            miningDrops,
            spectatorPickup,
            itemDropPickup,
            experienceOrbs,
            itemRestShape,
            edgeChunkBlockChange,
            subChunkBlockChanges,
            teleport
        ]
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
            dimensionsScenario,
            spawnpointRespawn,
            fallingBlockWater,
            // Last, because it reshapes the terrain it runs on - tilled ground, planted wheat
            // and a water source stay behind - and nothing should have to play on top of that.
            farmland
        ]
    },
    // Natural spawning needs its own content fixture so roaming cows cannot affect gameplay checks.
    // The canopy one runs last: it roofs the world over, and nothing after it would see the sky.
    { name: 'natural-spawn', scenarios: [naturalSpawnPlacement, naturalSpawnUnderCanopy] },
    { name: 'worldgen-spawn', scenarios: [worldgenSpawn, explorerMap] },
    // Its own suite: the reset between scenarios walks back to the flat world's spawn pad, which on
    // the noise world means generating the terrain around the origin first.
    { name: 'generated-fluids', scenarios: [generatedFluidFlow] },
    // Its own suite for the same reason: the reset would generate the noise Overworld's origin.
    { name: 'worldgen-dimensions', scenarios: [worldgenDimensions] },
    // Its own suite, because the second level is a world every other scenario would also tick.
    { name: 'levels', scenarios: [levelIsolation, secondLevelSummon, levelTransfer] },
    // Its own suite: a kicked client is gone, so nothing can run after it.
    { name: 'kick', scenarios: [kick] }
];
