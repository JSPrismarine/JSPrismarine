import { NetworkUtil } from '../../network/NetworkUtil';
import BlockPosition from '../../world/BlockPosition';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

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

    // TODO: complete
}

/**
 * Plays a named sound at a position, once or on a loop.
 *
 * The layout is protocol 2193's. The position travels as a block position in eighths of a
 * block - three signed varints, each the coordinate times eight - and after the pitch come
 * the fields 1.26.50 added: a loop count, a flag telling the client to play the sound however
 * far away it is, and two optionals, a handle the server can later stop the sound by and a
 * position in seconds to start playback from.
 *
 * **Bound To:** Client
 */
export default class PlaySoundPacket extends DataPacket {
    public static NetID = Identifiers.PlaySoundPacket;

    public name: SoundName | string = '';
    public position: BlockPosition | null = null;
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

    public decodePayload(): void {
        this.name = NetworkUtil.readString(this);
        // Eighths of a block on the wire, floored to the block here: the packet asks for a
        // block position and that is what a reader gets back, not a fraction of one.
        this.position = new BlockPosition(
            Math.floor(this.readVarInt() / 8),
            Math.floor(this.readVarInt() / 8),
            Math.floor(this.readVarInt() / 8)
        );
        this.volume = this.readFloatLE();
        this.pitch = this.readFloatLE();
        this.loopCount = this.readVarInt();
        this.bypassListenerRangeCheck = this.readBoolean();
        this.soundHandle = this.readBoolean() ? this.readUnsignedLongLE() : null;
        this.playbackPositionSeconds = this.readBoolean() ? this.readFloatLE() : null;
    }

    public encodePayload(): void {
        const position = this.position ?? new BlockPosition(0, 0, 0);

        NetworkUtil.writeString(this, this.name);
        this.writeVarInt(Math.floor(position.getX() * 8));
        this.writeVarInt(Math.floor(position.getY() * 8));
        this.writeVarInt(Math.floor(position.getZ() * 8));
        this.writeFloatLE(this.volume);
        this.writeFloatLE(this.pitch);
        this.writeVarInt(this.loopCount);
        this.writeBoolean(this.bypassListenerRangeCheck);
        this.writeBoolean(this.soundHandle !== null);
        if (this.soundHandle !== null) this.writeUnsignedLongLE(this.soundHandle);
        this.writeBoolean(this.playbackPositionSeconds !== null);
        if (this.playbackPositionSeconds !== null) this.writeFloatLE(this.playbackPositionSeconds);
    }
}
