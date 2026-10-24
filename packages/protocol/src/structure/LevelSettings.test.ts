import fs from 'node:fs';
import { Difficulty, Dimension, Gametype, Generator, PlayerPermissionLevel, SpawnBiome } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import StartGamePacket, { GameRuleType } from '../packet/StartGamePacket';
import BlockPos from './BlockPos';
import Experiments from './Experiments';
import LevelSettings, { ServerEditorConnectionPolicy, SocialGamePublishSettings } from './LevelSettings';
import SpawnSettings from './SpawnSettings';

import type { GameRule } from '../packet/StartGamePacket';

const serialize = (settings: LevelSettings): Buffer => {
    const stream = new NetworkBinaryStream();
    settings.serialize(stream);
    return stream.getBuffer();
};

describe('LevelSettings', () => {
    const rules: GameRule[] = [
        { name: 'doDaylightCycle', editable: true, type: GameRuleType.BOOL, value: true },
        { name: 'randomTickSpeed', editable: true, type: GameRuleType.INT, value: 3 },
        { name: 'ruleFloat', editable: false, type: GameRuleType.FLOAT, value: 1.5 },
        { name: 'ruleNone', editable: false, type: GameRuleType.NONE, value: 0 }
    ];

    // Rule Data: a varuint count, then per rule the name, the editable flag, the variant
    // selector and the value. An int is four little endian bytes, a float likewise.
    const RULE_DATA = Buffer.from([
        0x04,
        0x0f,
        ...Buffer.from('doDaylightCycle'),
        0x01,
        0x01,
        0x01,
        0x0f,
        ...Buffer.from('randomTickSpeed'),
        0x01,
        0x02,
        0x03,
        0x00,
        0x00,
        0x00,
        0x09,
        ...Buffer.from('ruleFloat'),
        0x00,
        0x03,
        0x00,
        0x00,
        0xc0,
        0x3f,
        0x08,
        ...Buffer.from('ruleNone'),
        0x00,
        0x00
    ]);

    interface Tail {
        forceOverride: Buffer;
        policy: number;
        allowAnonymousDrops: boolean;
    }

    /** The whole structure in the docs' field order, written with primitives only. */
    const expectedBytes = (tail: Tail): Buffer => {
        const s = new NetworkBinaryStream();
        s.writeUnsignedLongLE(1234n); // 0 Seed
        s.writeShortLE(SpawnBiome.DEFAULT); // 1 Spawn Settings
        s.writeString('');
        s.writeVarInt(Dimension.OVERWORLD);
        s.writeVarInt(Generator.FLAT); // 2 Generator Type
        s.writeVarInt(Gametype.SURVIVAL); // 3 Game Type
        s.writeBoolean(true); // 4 Is Hardcore
        s.writeVarInt(Difficulty.NORMAL); // 5 Game Difficulty
        s.writeVarInt(1); // 6 Default Spawn Block Position
        s.writeVarInt(64);
        s.writeVarInt(-3);
        s.writeBoolean(false); // 7 Achievements Disabled
        s.writeVarInt(0); // 8 Editor World Type
        s.writeBoolean(false); // 9 Is Created In Editor
        s.writeBoolean(false); // 10 Is Exported From Editor
        s.writeVarInt(-1); // 11 Day Cycle Stop Time
        s.writeUnsignedVarInt(0); // 12 Education Edition Offer
        s.writeBoolean(false); // 13 Education Features Enabled
        s.writeString(''); // 14 Education Product ID
        s.writeFloatLE(0); // 15 Rain Level
        s.writeFloatLE(0.5); // 16 Lightning Level
        s.writeBoolean(false); // 17 Has Confirmed Platform Locked Content
        s.writeBoolean(true); // 18 Multiplayer Game Intent
        s.writeBoolean(true); // 19 LAN Broadcast Intent
        s.writeVarInt(4); // 20 Xbox Live Broadcast Setting: Public
        s.writeVarInt(3); // 21 Platform Broadcast Setting: FriendsOfFriends
        s.writeBoolean(true); // 22 Commands Enabled
        s.writeBoolean(false); // 23 Texture Packs Required
        s.write(RULE_DATA); // 24 Rule Data
        s.writeUnsignedIntLE(0); // 25 Experiments: no toggles, never toggled
        s.writeBoolean(false);
        s.writeBoolean(false); // 26 Has Bonus Chest Enabled
        s.writeBoolean(false); // 27 Start With Map Enabled
        s.writeByte(PlayerPermissionLevel.MEMBER); // 28 Player Permissions
        s.writeIntLE(4); // 29 Server Chunk Tick Range
        for (let i = 30; i <= 39; i++) s.writeBoolean(false); // 30..39 ten flags
        s.writeString('*'); // 40 Base Game Version
        s.writeIntLE(0); // 41 Limited World Width
        s.writeIntLE(0); // 42 Limited World Depth
        s.writeBoolean(true); // 43 Nether Type
        s.writeString(''); // 44 Edu Shared Uri Resource
        s.writeString('');
        s.write(tail.forceOverride); // 45 Override Force Experimental Gameplay
        s.writeByte(0); // 46 Chat Restriction Level
        s.writeBoolean(false); // 47 Disable Player Interactions
        s.writeVarInt(tail.policy); // 48 Server Editor Connection Policy
        s.writeBoolean(tail.allowAnonymousDrops); // 49 Allow Anonymous Block Drops In Editor Worlds
        return s.getBuffer();
    };

    const build = (
        forceOverrideExperimentalGameplay?: boolean,
        policy?: ServerEditorConnectionPolicy,
        drops?: boolean
    ) =>
        new LevelSettings(
            1234n,
            new SpawnSettings(SpawnBiome.DEFAULT, '', Dimension.OVERWORLD),
            Difficulty.NORMAL,
            new BlockPos(1, 64, -3),
            -1,
            0,
            0.5,
            true,
            rules,
            PlayerPermissionLevel.MEMBER,
            {
                gamemode: Gametype.SURVIVAL,
                generator: Generator.FLAT,
                hardcore: true,
                xblBroadcastSettings: SocialGamePublishSettings.PUBLIC,
                platformBroadcastSettings: SocialGamePublishSettings.FRIENDS_OF_FRIENDS,
                ...(forceOverrideExperimentalGameplay === undefined ? {} : { forceOverrideExperimentalGameplay }),
                ...(policy === undefined ? {} : { serverEditorConnectionPolicy: policy }),
                ...(drops === undefined ? {} : { allowAnonymousBlockDropsInEditorWorlds: drops })
            }
        );

    it('writes every field in docs order, with no experimental override', () => {
        expect(serialize(build())).toEqual(
            expectedBytes({ forceOverride: Buffer.from([0x00]), policy: 0, allowAnonymousDrops: false })
        );
    });

    it('writes a present experimental override as a presence byte and the value', () => {
        expect(serialize(build(true, ServerEditorConnectionPolicy.MIXED, true))).toEqual(
            expectedBytes({ forceOverride: Buffer.from([0x01, 0x01]), policy: 3, allowAnonymousDrops: true })
        );
        expect(serialize(build(false))).toEqual(
            expectedBytes({ forceOverride: Buffer.from([0x01, 0x00]), policy: 0, allowAnonymousDrops: false })
        );
    });

    it('writes the exact bytes a real server sent for its level settings', () => {
        const captured = fs.readFileSync(
            new URL('../packet/__fixtures__/start-game-bds-1.26.51.1.bin', import.meta.url)
        );
        const data = new StartGamePacket().deserialize(new NetworkBinaryStream(captured));

        const experiments = new Experiments();
        experiments.toggled = data.experiments;
        experiments.wereEverAlreadyToggled = data.experimentsEverToggled;

        const settings = new LevelSettings(
            data.seed,
            new SpawnSettings(data.spawnBiomeType, data.userDefinedBiomeName, data.dimension),
            data.difficulty,
            new BlockPos(data.spawnPosition.x, data.spawnPosition.y, data.spawnPosition.z),
            data.dayCycleStopTime,
            data.rainLevel,
            data.lightningLevel,
            data.commandsEnabled,
            data.gameRules,
            data.playerPermissions,
            {
                gamemode: data.worldGamemode,
                generator: data.generator,
                hardcore: data.hardcore,
                achievementsDisabled: data.achievementsDisabled,
                editorWorldType: data.editorWorldType,
                createdInEditor: data.createdInEditor,
                exportedFromEditor: data.exportedFromEditor,
                eduEditionOffer: data.educationEditionOffer,
                eduFeaturesEnabled: data.educationFeaturesEnabled,
                eduProductId: data.educationProductId,
                confirmedPlatformLockedContent: data.confirmedPlatformLockedContent,
                xblBroadcastSettings: data.xboxLiveBroadcastSetting,
                platformBroadcastSettings: data.platformBroadcastSetting,
                texturePacksRequired: data.texturePacksRequired,
                experiments,
                bonusChestEnabled: data.bonusChestEnabled,
                startWithMapEnabled: data.startWithMapEnabled,
                serverChunkTickRange: data.serverChunkTickRange,
                lockedBehaviorPack: data.hasLockedBehaviorPack,
                lockedResourcePack: data.hasLockedResourcePack,
                fromLockedWorldTemplate: data.isFromLockedTemplate,
                onlyMsaGamertags: data.useMsaGamertagsOnly,
                onlySpawningV1Villagers: data.onlySpawnV1Villagers,
                personaDisabled: data.personaDisabled,
                customSkinDisabled: data.customSkinsDisabled,
                emoteChatMuted: data.emoteChatMuted,
                baseGameVersion: data.baseGameVersion,
                limitedWorldWidth: data.limitedWorldWidth,
                limitedWorldDepth: data.limitedWorldDepth,
                newNether: data.newNether,
                eduSharedUriResource: data.eduSharedUriResource,
                forceOverrideExperimentalGameplay: data.forceExperimentalGameplay,
                chatRestrictionLevel: data.chatRestrictionLevel,
                disablePlayerInteractions: data.disablePlayerInteractions,
                serverEditorConnectionPolicy: data.serverEditorConnectionPolicy,
                allowAnonymousBlockDropsInEditorWorlds: data.allowAnonymousBlockDropsInEditorWorlds
            }
        );

        const serialized = serialize(settings);
        expect(serialized.byteLength).toBeGreaterThan(100);
        expect(captured.indexOf(serialized)).not.toBe(-1);
    });
});
