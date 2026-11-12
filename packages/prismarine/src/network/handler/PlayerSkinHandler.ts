import type Skin from '@jsprismarine/protocol/wire/structures/skin/Skin';
import type SkinImage from '@jsprismarine/protocol/wire/structures/skin/SkinImage';
import PlayerSkinPacket from '@jsprismarine/protocol/packet/PlayerSkinPacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

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
 * to anyone who joins later, and a fresh `PlayerSkinPacket` goes to every other player in play,
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
export default class PlayerSkinHandler implements InputLaneHandler<PlayerSkinPacket> {
    public static PacketName = 'PlayerSkinPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    /**
     * Stores the new skin on the sender and relays it to every other player.
     * @param {PlayerSkinPacket} packet - The skin change.
     * @param {InputContext} context - The client that sent it, the other sessions and the logger.
     */
    public handle(packet: PlayerSkinPacket, { session, log, services, step }: InputContext): undefined {
        const { identity } = session;

        if (packet.uuid.toString() !== identity.uuid) {
            log.debug(
                `Dropped skin change from §b${identity.name}§r for another player's UUID ${packet.uuid.toString()}`,
                'PlayerSkinHandler/handle'
            );
            return;
        }

        const problem = skinProblem(packet.skin);
        if (problem !== null) {
            log.debug(`Dropped skin change from §b${identity.name}§r: ${problem}`, 'PlayerSkinHandler/handle');
            return;
        }

        // The skin other clients are shown, which the store player's actor reads.
        session.getPlayer().skin = packet.skin;

        // The entry the session manager sends to whoever joins later was built at login.
        const playerList = services.sessions.getPlayerList();
        const entry = playerList.get(identity.uuid);
        if (entry !== undefined) playerList.set(identity.uuid, entry.withSkin(packet.skin));

        const relay = new PlayerSkinPacket();
        relay.uuid = packet.uuid;
        relay.skin = packet.skin;
        relay.newSkinName = packet.newSkinName;
        relay.oldSkinName = packet.oldSkinName;

        // Only clients in play. One still in the resource pack exchange is online already, and a
        // retail client handed a game packet then drops with `InitialConnection-90`; it learns
        // the skin from the player list entry once it gets to play.
        const others = services.sessions
            .getSessions()
            .filter((other) => other.runtimeId !== session.runtimeId && other.getConnection().phase === 'play');
        for (const other of others) step.output(other.send(relay));

        log.debug(
            `§b${identity.name}§r changed skin to §b${packet.skin.getId()}§r, relayed to ${others.length} player(s)`,
            'PlayerSkinHandler/handle'
        );
    }
}
