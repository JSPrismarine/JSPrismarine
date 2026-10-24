import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * A `MinecraftEventing::AchievementIds` member, the game's numbering for its achievements.
 *
 * The values are the ones the wire carries, from Mojang's enum datagen and the protocol site's
 * 1.26.60-preview.21 changelog. The 1.26.51 type page numbers the members 0 to 81 in list
 * order; that is a rendering artifact, not the wire value. The numbering has gaps where
 * achievements were retired.
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
    PlethoraOfCats = 126
}

/** The fields of an `AwardAchievementPacket`, in wire order. */
export interface AwardAchievement {
    /**
     * `AchievementID`: which achievement to award. The docs type it as a bare int32; the
     * numbers are the {@link AchievementId} members the telemetry `Achievement` event also
     * uses, and gophertunnel calls them unknown, so a value outside the enum passes through.
     */
    achievementId: AchievementId;
}

/**
 * Awards one achievement to the receiving player.
 *
 * Protocol 2193 layout: `AchievementID` as a little-endian int32, four bytes, not a varint.
 * Achievements only exist on platform-signed worlds, so a dedicated server sending this does
 * nothing visible on a client that joined over LAN or a server list entry.
 */
export default class AwardAchievementPacket extends NetworkPacket<AwardAchievement> {
    public get id(): number {
        return PacketIdentifier.AWARD_ACHIEVEMENT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AwardAchievement): void {
        stream.writeIntLE(data.achievementId);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AwardAchievement {
        const achievementId: AchievementId = stream.readIntLE();

        return { achievementId };
    }
}
