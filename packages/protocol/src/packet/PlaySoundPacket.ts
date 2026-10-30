import { Vector3 } from '@jsprismarine/math';

import FieldNetworkPacket from '../FieldNetworkPacket';
import { layoutAt } from '../wire/WireLayout';
import { playSoundPacket } from '../wire/definitions/levelSoundEvent';

/** Sound names this packet and the `/playsound` command accept, a subset of the client's sound definitions. */
export enum SoundName {
    // Ambient
    AMBIENT_BASALT_DELTAS_MOOD = 'ambient.basalt_deltas.mood',
    AMBIENT_CAVE = 'ambient.cave',
    AMBIENT_CRIMSON_FOREST_MOOD = 'ambient.crimson_forest.mood',
    AMBIENT_NETHER_WASTES_MOOD = 'ambient.nether_wastes.mood',
    AMBIENT_SOULSAND_VALLEY_MOOD = 'ambient.soulsand_valley.mood',
    AMBIENT_WARPED_FOREST_MOOD = 'ambient.warped_forest.mood',
    AMBIENT_WEATHER_LIGHTNING_IMPACT = 'ambient.weather.lightning.impact',
    AMBIENT_WEATHER_RAIN = 'ambient.weather.rain',
    AMBIENT_WEATHER_THUNDER = 'ambient.weather.thunder',

    // Armor
    ARMOR_EQUIP_NETHERITE = 'armor.equip_netherite',
    ARMOR_EQUIP_CHAIN = 'armor.equip_chain',
    ARMOR_EQUIP_DIAMOND = 'armor.equip_diamond',
    ARMOR_EQUIP_GENERIC = 'armor.equip_generic',
    ARMOR_EQUIP_GOLD = 'armor.equip_gold',
    ARMOR_EQUIP_IRON = 'armor.equip_iron',
    ARMOR_EQUIP_LEATHER = 'armor.equip_leather',

    // Beacon
    BEACON_ACTIVATE = 'beacon.activate',
    BEACON_AMBIENT = 'beacon.ambient',
    BEACON_DEACTIVATE = 'beacon.deactivate',
    BEACON_POWER = 'beacon.power',

    // Blocks
    BLOCK_BAMBOO_BREAK = 'block.bamboo.break',
    BLOCK_BAMBOO_FALL = 'block.bamboo.fall',
    BLOCK_BAMBOO_HIT = 'block.bamboo.hit',
    BLOCK_BAMBOO_PLACE = 'block.bamboo.place',
    BLOCK_BAMBOO_STEP = 'block.bamboo.step',
    BLOCK_BAMBOO_SAPLING_BREAK = 'block.bamboo_sapling.break',
    BLOCK_BAMBOO_SAPLING_PLACE = 'block.bamboo_sapling.place',
    BLOCK_BARREL_CLOSE = 'block.barrel.close',
    BLOCK_BARREL_OPEN = 'block.barrel.open',
    BLOCK_BEEHIVE_DRIP = 'block.beehive.drip',
    BLOCK_BEEHIVE_ENTER = 'block.beehive.enter',
    BLOCK_BEEHIVE_EXIT = 'block.beehive.exit',
    BLOCK_BEEHIVE_SHEAR = 'block.beehive.shear',
    BLOCK_BEEHIVE_WORK = 'block.beehive.work',
    BLOCK_BELL_HIT = 'block.bell.hit',
    BLOCK_BLASTFURNACE_FIRE_CRACKLE = 'block.blastfurnace.fire_crackle',
    BLOCK_CAMPFIRE_CRACKLE = 'block.campfire.crackle',
    BLOCK_CARTOGRAPHY_TABLE_USE = 'block.cartography_table.use',
    BLOCK_CHORUSFLOWER_DEATH = 'block.chorusflower.death',
    BLOCK_CHORUSFLOWER_GROW = 'block.chorusflower.grow',
    BLOCK_COMPOSTER_EMPTY = 'block.composter.empty',
    BLOCK_COMPOSTER_FILL = 'block.composter.fill',
    BLOCK_COMPOSTER_FILL_SUCCESS = 'block.composter.fill_success',
    BLOCK_COMPOSTER_READY = 'block.composter.ready',
    BLOCK_END_PORTAL_SPAWN = 'block.end_portal.spawn',
    BLOCK_END_PORTAL_FRAME_FILL = 'block.end_portal_frame.fill',
    BLOCK_FALSE_PERMISSIONS = 'block.false_permissions',
    BLOCK_FURNACE_LIT = 'block.furnace.lit',
    BLOCK_GRINDSTONE_USE = 'block.grindstone.use'
}

/**
 * Plays a named sound at a position, once or on a loop.
 *
 * Wire order at protocol 2193: `Name` as a string, `Position` as a `BlockPos` of three ZigZag
 * varint32 holding each coordinate times eight (the client divides them back, so the sound
 * lands on an eighth of a block), `Volume` and `Pitch` as little-endian floats, then the
 * fields 1.26.50 added: `Loop Count` as a ZigZag varint32, `Bypass Listener Range Check` as
 * one byte, and two optionals behind a presence byte each, `Server Sound Handle` as a
 * little-endian uint64 and `Playback Position Seconds` as a float.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/play-sound-packet/
 */
export default class PlaySoundPacket extends FieldNetworkPacket {
    public name: SoundName | string = '';
    /**
     * Where the sound plays.
     *
     * A `Vector3` because the wire carries eighths of a block, then the reader
     * rounds down to whole block coordinates. The fractions do not survive a
     * decode.
     */
    public position: Vector3 | null = null;
    public volume = 1;
    public pitch = 1;
    /** How many times to loop; -1 plays once. */
    public loopCount = -1;
    /** Play it whatever the distance, rather than fading it out by the listener's range. */
    public bypassListenerRangeCheck = false;
    /** A handle the server may name in a later packet to stop this sound. */
    public soundHandle: bigint | null = null;
    /** Where in the sound to start, in seconds. */
    public playbackPositionSeconds: number | null = null;

    /** Reads the sound name, quantized position, playback settings, and optional fields. */
    public decodePayload(): void {
        const payload = layoutAt(playSoundPacket, this.codecProtocol).decode(this);
        this.name = payload.name;
        this.position = new Vector3(payload.position.x, payload.position.y, payload.position.z);
        this.volume = payload.volume;
        this.pitch = payload.pitch;
        this.loopCount = payload.loopCount;
        this.bypassListenerRangeCheck = payload.bypassListenerRangeCheck;
        this.soundHandle = payload.soundHandle;
        this.playbackPositionSeconds = payload.playbackPositionSeconds;
    }

    /** Writes the fields in wire order, using the origin when no position was set. */
    public encodePayload(): void {
        const position = this.position ?? new Vector3(0, 0, 0);

        layoutAt(playSoundPacket, this.codecProtocol).encode(this, {
            name: this.name,
            position: { x: position.getX(), y: position.getY(), z: position.getZ() },
            volume: this.volume,
            pitch: this.pitch,
            loopCount: this.loopCount,
            bypassListenerRangeCheck: this.bypassListenerRangeCheck,
            soundHandle: this.soundHandle,
            playbackPositionSeconds: this.playbackPositionSeconds
        });
    }
}
