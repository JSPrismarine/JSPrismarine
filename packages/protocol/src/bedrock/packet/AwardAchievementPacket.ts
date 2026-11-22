import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { awardAchievementPacket } from '../wire/definitions/awardAchievement';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { AwardAchievementPayload } from '../wire/definitions/awardAchievement';

/**
 * A `MinecraftEventing::AchievementIds` member, the game's numbering for its achievements.
 *
 * The values are the ones the wire carries, from Mojang's enum datagen and the protocol site's
 * 1.26.60-preview.21 changelog. The 1.26.51 type page numbers the members 0 to 81 in list
 * order; that is a rendering artifact, not the wire value. The numbering has gaps where
 * achievements were retired. The pinned enums.html backs the numbers 7 to 117; the numbers 118
 * to 127 come from the 1.26.60 type page alone.
 */
export enum AchievementId {
    ChestFullOfCobblestone = 7,
    DiamondForYou = 10,
    IronBelly = 20,
    IronMan = 21,
    OnARail = 29,
    Overkill = 30,
    ReturnToSender = 37,
    SniperDuel = 38,
    StayinFrosty = 39,
    TakeInventory = 40,
    MapRoom = 50,
    FreightStation = 52,
    SmeltEverything = 53,
    TasteOfYourOwnMedicine = 54,
    WhenPigsFly = 56,
    Inception = 58,
    ArtificialSelection = 60,
    FreeDiver = 61,
    SpawnTheWither = 62,
    Beaconator = 63,
    GreatView = 64,
    SuperSonic = 65,
    TheEndAgain = 66,
    TreasureHunter = 67,
    ShootingStar = 68,
    FashionShow = 69,
    SelfPublishedAuthor = 71,
    AlternativeFuel = 72,
    SleepWithTheFishes = 73,
    Castaway = 74,
    ImAMarineBiologist = 75,
    SailThe7Seas = 76,
    MeGold = 77,
    Ahoy = 78,
    Atlantis = 79,
    OnePickleTwoPickleSeaPickleFour = 80,
    DoaBarrelRoll = 81,
    Moskstraumen = 82,
    Echolocation = 83,
    WhereHaveYouBeen = 84,
    TopOfTheWorld = 85,
    FruitOnTheLoom = 86,
    SoundTheAlarm = 87,
    BuyLowSellHigh = 88,
    Disenchanted = 89,
    TimeForStew = 90,
    BeeOurGuest = 91,
    TotalBeeLocation = 92,
    StickySituation = 93,
    CoverMeInDebris = 94,
    FloatYourGoat = 95,
    Friend = 96,
    WaxOnWaxOff = 97,
    StriderRiddenInLavaInOverworld = 98,
    GoatHornAcquired = 99,
    JukeboxUsedInMeadows = 100,
    TradedAtWorldHeight = 101,
    SurvivedFallFromWorldHeight = 102,
    SneakCloseToSculkSensor = 103,
    ItSpreads = 104,
    BirthdaySong = 105,
    WithOurPowersCombined = 106,
    PlantingThePast = 107,
    CarefulRestoration = 108,
    Revaulting = 109,
    CraftersCraftingCrafters = 110,
    WhoNeedsRockets = 111,
    OverOverkill = 112,
    HeartTransplanter = 113,
    StayHydrated = 114,
    MobKabob = 115,
    AdventuringTime = 116,
    UhOh = 117,
    GettingWood = 118,
    BenchMaking = 119,
    TimeToMine = 120,
    HotTopic = 121,
    AcquireHardware = 122,
    GettingAnUpgrade = 123,
    MonsterHunter = 124,
    Diamonds = 125,
    PlethoraOfCats = 126,
    /** Added in protocol 2225 (1.26.60); protocol 2193 has no such achievement. */
    WhatGoesAroundComesAround = 127
}

/** The fields of an `AwardAchievementPacket`, in wire order. */
export type AwardAchievement = AwardAchievementPayload;

/**
 * Awards one achievement to the receiving player.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/award-achievement-packet/
 *
 * Protocol 2193 layout: `AchievementID` as a little-endian int32, four bytes, not a varint.
 * Achievements only exist on platform-signed worlds, so a dedicated server sending this does
 * nothing visible on a client that joined over LAN or a server list entry.
 */
export default class AwardAchievementPacket extends NetworkPacket<AwardAchievementPayload> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'AwardAchievementPacket';
    }

    public get id(): number {
        return PacketIdentifier.AWARD_ACHIEVEMENT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AwardAchievementPayload): void {
        layoutAt(awardAchievementPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AwardAchievementPayload {
        return layoutAt(awardAchievementPacket, this.codecProtocol).decode(stream);
    }
}
