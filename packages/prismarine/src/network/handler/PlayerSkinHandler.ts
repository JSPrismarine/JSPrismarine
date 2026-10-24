import type Server from '../../Server';
import type Skin from '../../utils/skin/Skin';
import type SkinImage from '../../utils/skin/SkinImage';
import Identifiers from '../Identifiers';
import type PlayerSession from '../PlayerSession';
import PlayerSkinPacket from '../packet/PlayerSkinPacket';
import type PacketHandler from './PacketHandler';

/** The largest `Width` or `Height` the `SkinImage` schema allows. */
const MAX_IMAGE_SIDE = 4096;

/** A `SkinImage` pixel is RGBA. */
const BYTES_PER_PIXEL = 4;

/**
 * Why an image cannot go back out to other clients, or null when it can.
 *
 * `ImageBytes` is a list of its own beside `Width` and `Height`, so a client can send a size
 * the bytes do not fill. gophertunnel refuses such a skin outright, and a client handed one
 * has no pixels to draw where the size says there are some.
 */
const imageProblem = (image: SkinImage, name: string): string | null => {
    if (image.width > MAX_IMAGE_SIDE || image.height > MAX_IMAGE_SIDE) {
        return `${name} is ${image.width}x${image.height}, more than ${MAX_IMAGE_SIDE} a side`;
    }

    const expected = image.width * image.height * BYTES_PER_PIXEL;
    if (image.data.byteLength !== expected) {
        return `${name} has ${image.data.byteLength} bytes for ${image.width}x${image.height}, which needs ${expected}`;
    }

    return null;
};

const parsesAsJson = (text: string): boolean => {
    try {
        JSON.parse(text);
        return true;
    } catch {
        return false;
    }
};

/**
 * Why a skin cannot be relayed, or null when every image fills its size and the geometry
 * parses.
 *
 * `GeometryData` is a `Json::Value`; the docs ask the receiver to verify it parses as JSON.
 * An empty string is a skin without geometry of its own, which the player list sends for
 * every login skin that came without one, so it passes.
 */
const skinProblem = (skin: Skin): string | null => {
    const images: Array<[SkinImage, string]> = [
        [skin.getImage(), 'skin image'],
        [skin.getCape().getImage(), 'cape image'],
        ...[...skin.getAnimations()].map((animation, index): [SkinImage, string] => [
            animation.getImage(),
            `animation ${index}`
        ])
    ];
    for (const [image, name] of images) {
        const problem = imageProblem(image, name);
        if (problem !== null) return problem;
    }

    const geometry = skin.getGeometry();
    if (geometry !== '' && !parsesAsJson(geometry)) return 'geometry data is not JSON';

    return null;
};

/**
 * A client changing its skin mid-session.
 *
 * The skin is stored on the player and on the player's list entry, so the player list shows it
 * to anyone who joins later, and a fresh `PlayerSkinPacket` goes to every other online player,
 * so they see the change now. The relay is written by the server's own skin writer rather than
 * forwarded as the bytes the client sent: a decoded packet keeps its buffer and would go out
 * again unchanged, carrying whatever `TrustedSkinFlag` the client claimed, where the server
 * vouches for no skin and writes `false`.
 *
 * A packet naming another player's UUID is dropped, since honoring it would let one client
 * redress another. So is a skin whose image bytes do not fill its size, whose image is more
 * than 4096 pixels a side, or whose geometry is not JSON; the other clients would be left to
 * reject it.
 */
export default class PlayerSkinHandler implements PacketHandler<PlayerSkinPacket> {
    public static NetID = Identifiers.PlayerSkinPacket;

    /**
     * Stores the new skin on the sender and relays it to every other player.
     * @param {PlayerSkinPacket} packet - The skin change.
     * @param {Server} server - The server, for its players and logger.
     * @param {PlayerSession} session - The client that sent it.
     */
    public async handle(packet: PlayerSkinPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const logger = server.getLogger();

        if (!packet.uuid.equals(player.getUUID())) {
            logger.debug(
                `Dropped skin change from §b${player.getName()}§r for another player's UUID ${packet.uuid.toString()}`,
                'PlayerSkinHandler/handle'
            );
            return;
        }

        const problem = skinProblem(packet.skin);
        if (problem !== null) {
            logger.debug(`Dropped skin change from §b${player.getName()}§r: ${problem}`, 'PlayerSkinHandler/handle');
            return;
        }

        player.skin = packet.skin;

        // The entry the session manager sends to whoever joins later was built at login.
        const playerList = server.getSessionManager().getPlayerList();
        const key = player.getUUID().toString();
        const entry = playerList.get(key);
        if (entry !== undefined) playerList.set(key, entry.withSkin(packet.skin));

        const relay = new PlayerSkinPacket();
        relay.uuid = packet.uuid;
        relay.skin = packet.skin;
        relay.newSkinName = packet.newSkinName;
        relay.oldSkinName = packet.oldSkinName;

        const others = server
            .getSessionManager()
            .getAllPlayers()
            .filter((other) => other !== player);
        await Promise.all(others.map((other) => other.getNetworkSession().send(relay)));

        logger.debug(
            `§b${player.getName()}§r changed skin to §b${packet.skin.getId()}§r, relayed to ${others.length} player(s)`,
            'PlayerSkinHandler/handle'
        );
    }
}
