import type BinaryStream from '@jsprismarine/binaryutils';
import { NetworkUtil } from '../../network/NetworkUtil';
import SkinAnimation from './SkinAnimation';
import SkinCape from './SkinCape';
import SkinImage from './SkinImage';
import SkinPersona from './skin-persona/SkinPersona';
import SkinPersonaPiece from './skin-persona/SkinPersonaPiece';
import SkinPersonaPieceTintColor from './skin-persona/SkinPersonaPieceTintColor';

interface Image {
    ImageWidth: number;
    ImageHeight: number;
    Image: string;
}

interface AnimatedImageData extends Image {
    Frames: number;
    Type: number;
    AnimationExpression: number;
}

interface PersonaPiece {
    IsDefault: boolean;
    PackId: string;
    PieceId: string;
    PieceType: string;
    ProductId: string;
}

interface PieceTintColor {
    Colors: string[];
    PieceType: string;
}

interface JWT {
    SkinId: string;
    CapeId: string;
    SkinResourcePatch: string;
    PlayFabId: string;
    SkinImageHeight: number;
    SkinImageWidth: number;
    SkinGeometryData: string;
    SkinAnimationData: string;
    CapeImageHeight: number;
    CapeImageWidth: number;
    CapeOnClassicSkin: boolean;
    SkinData: string;
    CapeData: string;
    PremiumSkin: boolean;
    PersonaSkin: boolean;
    SkinColor: string;
    ArmSize: string;
    AnimatedImageData: AnimatedImageData[];
    PersonaPieces: PersonaPiece[];
    PieceTintColors: PieceTintColor[];
}

/**
 * A string field of the client data, or empty when the client did not send one.
 *
 * Every one of these is optional in practice: a client omits what does not apply to it, and
 * `PlayFabId` is absent for anyone the marketplace has never seen. Absent is not a broken skin
 * - it is an empty string - but reading it as one crashed the *player list*, which is built
 * from every player's skin, so one client without a PlayFab id took the list down for everyone.
 */
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The same, for the fields that arrive base64 encoded. */
const decode = (value: unknown): string => Buffer.from(text(value), 'base64').toString();

export default class Skin {
    private id!: string;
    private playFabId!: string;
    private resourcePatch!: string;
    private image!: SkinImage;
    private readonly animations: Set<SkinAnimation> = new Set();
    private cape!: SkinCape;
    private geometry!: string;
    private animationData!: string;
    private premium!: boolean;
    private persona!: boolean;
    private capeOnClassicSkin!: boolean;
    private color = '#0';
    private armSize = 'wide';
    private personaData!: SkinPersona;

    /**
     * Full skin ID, computed because
     * not sent on JWT.
     */
    public fullId!: string;
    public isTrusted = true;

    /**
     * Loads a skin from a JSON file containing skin data
     * using minecraft bedrock login fields.
     *
     * (loads the skin persona)
     */
    public static fromJWT(jwt: JWT): Skin {
        const skin = new Skin();

        // Read skin
        skin.id = text(jwt.SkinId);
        skin.resourcePatch = decode(jwt.SkinResourcePatch);
        skin.image = new SkinImage({
            width: jwt.SkinImageWidth,
            height: jwt.SkinImageHeight,
            data: Buffer.from(text(jwt.SkinData), 'base64')
        });
        skin.playFabId = text(jwt.PlayFabId);
        skin.color = text(jwt.SkinColor);
        skin.armSize = text(jwt.ArmSize);

        // Read animations
        for (const animation of jwt.AnimatedImageData) {
            skin.animations.add(
                new SkinAnimation({
                    image: new SkinImage({
                        width: animation.ImageWidth,
                        height: animation.ImageHeight,
                        data: Buffer.from(animation.Image, 'base64')
                    }),
                    frames: animation.Frames,
                    type: animation.Type,
                    expression: animation.AnimationExpression
                })
            );
        }

        // Read cape
        skin.cape = new SkinCape({
            id: text(jwt.CapeId),
            image: new SkinImage({
                width: jwt.CapeImageWidth,
                height: jwt.CapeImageHeight,
                data: Buffer.from(text(jwt.CapeData), 'base64')
            })
        });

        // TODO: make a class to manage geometry
        skin.geometry = decode(jwt.SkinGeometryData);

        // TODO: Most of the times is empty, figure out what is it
        skin.animationData = decode(jwt.SkinAnimationData);

        // Read skin boolean properties
        skin.premium = jwt.PremiumSkin;
        skin.persona = jwt.PersonaSkin;
        skin.capeOnClassicSkin = jwt.CapeOnClassicSkin;

        // Avoid reading when skin is not persona type
        if (skin.persona) {
            skin.personaData = new SkinPersona();

            // Read persona pieces
            for (const personaPiece of jwt.PersonaPieces) {
                skin.personaData.getPieces().add(
                    new SkinPersonaPiece({
                        def: personaPiece.IsDefault,
                        packId: personaPiece.PackId,
                        pieceId: personaPiece.PieceId,
                        pieceType: personaPiece.PieceType,
                        productId: personaPiece.ProductId
                    })
                );
            }

            // Read piece tint colors
            for (const pieceTintColor of jwt.PieceTintColors) {
                const tintColor = new SkinPersonaPieceTintColor();
                tintColor.getColors().push(...pieceTintColor.Colors);
                tintColor.setPieceType(pieceTintColor.PieceType);
                skin.personaData.getTintColors().add(tintColor);
            }
        }

        // Compute a full id
        skin.fullId = skin.id + skin.getCape().getId();
        return skin;
    }

    /**
     * Writes the skin as protocol 2193 carries it.
     *
     * The layout had drifted years out of date - it was still the 748-era shape, which is
     * exactly the sort of thing that only shows up against a real client, because this
     * server's own client decoded it with the same stale reader. Checked field for field
     * against gophertunnel's `protocol/skin.go` and against the bytes a Bedrock Dedicated
     * Server 1.26.51 puts on the wire. What was wrong:
     *
     * - The animation, persona-piece and tint counts were fixed 32-bit little-endian ints;
     *   they are unsigned varints, like every other list.
     * - The arm size was a string; it is a single byte (`slim` 0, `wide` 1).
     * - The skin colour was a string; it is a big-endian ARGB uint32.
     * - The tail was missing two fields the client reads: `trusted`, sent as the string
     *   `"true"`/`"false"`, and a profile hash string. Without them the entry after this one
     *   in the player list is read from the wrong place, and the client drops the join.
     */
    public networkSerialize(stream: BinaryStream): void {
        NetworkUtil.writeString(stream, this.getId());
        NetworkUtil.writeString(stream, this.getPlayFabId());
        NetworkUtil.writeString(stream, this.getResourcePatch());

        // Skin image
        this.getImage().networkSerialize(stream);

        // Animations
        stream.writeUnsignedVarInt(this.getAnimations().size);
        for (const animation of this.getAnimations()) {
            animation.getImage().networkSerialize(stream);
            stream.writeUnsignedVarInt(animation.getType());
            stream.writeFloatLE(animation.getFrames());
            stream.writeUnsignedVarInt(animation.getExpression());
        }

        // Cape image
        this.getCape().getImage().networkSerialize(stream);

        // Miscellaneous
        NetworkUtil.writeString(stream, this.getGeometry());
        NetworkUtil.writeString(stream, '0.0.0'); // geometry data engine version
        NetworkUtil.writeString(stream, this.getAnimationData());
        NetworkUtil.writeString(stream, this.getCape().getId());
        NetworkUtil.writeString(stream, this.getFullId());
        stream.writeByte(this.getArmSize() === 'slim' ? 0 : 1);
        stream.writeInt(Skin.colorToArgb(this.getColor())); // Big-endian ARGB.

        // Hack to keep less useless data in software
        if (this.isPersona()) {
            stream.writeUnsignedVarInt(this.getPersonaData().getPieces().size);
            for (const personaPiece of this.getPersonaData().getPieces()) {
                NetworkUtil.writeString(stream, personaPiece.getPieceId());
                NetworkUtil.writeString(stream, personaPiece.getPieceType());
                NetworkUtil.writeString(stream, personaPiece.getPackId());
                stream.writeBoolean(personaPiece.isDefault());
                NetworkUtil.writeString(stream, personaPiece.getProductId());
            }

            stream.writeUnsignedVarInt(this.getPersonaData().getTintColors().size);
            for (const tint of this.getPersonaData().getTintColors()) {
                NetworkUtil.writeString(stream, tint.getPieceType());
                stream.writeUnsignedVarInt(tint.getColors().length);
                for (const color of tint.getColors()) {
                    NetworkUtil.writeString(stream, color);
                }
            }
        } else {
            stream.writeUnsignedVarInt(0); // Persona pieces
            stream.writeUnsignedVarInt(0); // Tint colors
        }

        stream.writeBoolean(this.isPremium());
        stream.writeBoolean(this.isPersona());
        stream.writeBoolean(this.isCapeOnClassicSkin());
        stream.writeBoolean(false); // Is primary user
        stream.writeBoolean(true); // Is override appearance

        // `trusted` travels as a string, and a profile hash follows it. Both new to this
        // encoder; a self-made offline skin is not trusted and hashes to nothing.
        NetworkUtil.writeString(stream, 'false');
        NetworkUtil.writeString(stream, '');
    }

    /**
     * A skin colour string as the big-endian ARGB integer the wire carries.
     *
     * The client data gives it as `#rrggbbaa`, or `#0` when there is none. Anything that is
     * not parseable hex is sent as zero, which is what a Bedrock Dedicated Server puts on the
     * wire for a skin that carries no colour - it tints nothing.
     */
    private static colorToArgb(color: string): number {
        const hex = color.replace(/^#/, '');
        if (!/^[0-9a-fA-F]+$/.test(hex)) return 0;

        // `#rrggbbaa` on the client, ARGB on the wire.
        const rgba = Number.parseInt(hex.padStart(8, '0').slice(0, 8), 16);
        const [r, g, b, a] = [(rgba >>> 24) & 0xff, (rgba >>> 16) & 0xff, (rgba >>> 8) & 0xff, rgba & 0xff];
        return (a << 24) | (r << 16) | (g << 8) | b | 0;
    }

    public getId(): string {
        return this.id;
    }

    public getFullId(): string {
        return this.fullId || this.getId() + this.getCape().getId();
    }

    public getPlayFabId(): string {
        return this.playFabId;
    }

    public getResourcePatch(): string {
        return this.resourcePatch;
    }

    public getImage(): SkinImage {
        return this.image;
    }

    public getAnimations(): Set<SkinAnimation> {
        return this.animations;
    }

    public getAnimationData(): string {
        return this.animationData;
    }

    public isPersona(): boolean {
        return this.persona;
    }

    public isPremium(): boolean {
        return this.premium;
    }

    public isCapeOnClassicSkin(): boolean {
        return this.capeOnClassicSkin;
    }

    public getColor(): string {
        return this.color;
    }

    public getArmSize(): string {
        return this.armSize;
    }

    public getPersonaData(): SkinPersona {
        return this.personaData;
    }

    public getGeometry(): string {
        return this.geometry;
    }

    public getCape(): SkinCape {
        return this.cape;
    }
}
