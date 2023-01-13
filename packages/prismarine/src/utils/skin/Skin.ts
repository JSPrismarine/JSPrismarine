import BinaryStream from '@jsprismarine/jsbinaryutils';
import McpeUtil from '../../network/NetworkUtil.js';
import SkinAnimation from './SkinAnimation.js';
import SkinCape from './SkinCape.js';
import SkinImage from './SkinImage.js';
import SkinPersona from './skin-persona/SkinPersona.js';
import SkinPersonaPiece from './skin-persona/SkinPersonaPiece.js';
import SkinPersonaPieceTintColor from './skin-persona/SkinPersonaPieceTintColor.js';

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
    private color = '#0.js';
    private armSize = 'wide.js';
    private personaData!: SkinPersona;

    /**
     * Full skin ID, computed because
     * not sent on JWT.
     */
    public fullId!: string;
    public isTrusted = true;

    /**
     * Loads a skin from a JSON file contianing skin data
     * using minecraft bedrock login fields.
     *
     * (loads the skin persona)
     */
    public static fromJWT(jwt: JWT): Skin {
        const skin = new Skin();

        // Read skin
        skin.id = jwt.SkinId;
        skin.resourcePatch = Buffer.from(jwt.SkinResourcePatch, 'base64').toString();
        skin.image = new SkinImage({
            width: jwt.SkinImageWidth,
            height: jwt.SkinImageHeight,
            data: Buffer.from(jwt.SkinData, 'base64')
        });
        skin.playFabId = jwt.PlayFabId;
        skin.color = jwt.SkinColor;
        skin.armSize = jwt.ArmSize;

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
            id: jwt.CapeId,
            image: new SkinImage({
                width: jwt.CapeImageWidth,
                height: jwt.CapeImageHeight,
                data: Buffer.from(jwt.CapeData, 'base64')
            })
        });

        // TODO: make a class to manage geometry
        skin.geometry = Buffer.from(jwt.SkinGeometryData, 'base64').toString();

        // TODO: Most of the times is empty, figure out what is it
        skin.animationData = Buffer.from(jwt.SkinAnimationData, 'base64').toString();

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
        skin.fullId = skin.getCape().getId() + skin.id;
        return skin;
    }

    public networkSerialize(stream: BinaryStream): void {
        McpeUtil.writeString(stream, this.getId());
        McpeUtil.writeString(stream, this.getPlayFabId());
        McpeUtil.writeString(stream, this.getResourcePatch());

        // Skin image
        this.getImage().networkSerialize(stream);

        // Animations
        stream.writeUnsignedIntLE(this.getAnimations().size);
        for (const animation of this.getAnimations()) {
            animation.getImage().networkSerialize(stream);
            stream.writeUnsignedIntLE(animation.getType());
            stream.writeFloatLE(animation.getFrames());
            stream.writeUnsignedIntLE(animation.getExpression());
        }

        // Cape image
        this.getCape().getImage().networkSerialize(stream);

        // Miscellaneus
        McpeUtil.writeString(stream, this.getGeometry());
        McpeUtil.writeString(stream, this.getAnimationData());
        McpeUtil.writeString(stream, ''); // geometry data engine version
        McpeUtil.writeString(stream, this.getCape().getId());
        McpeUtil.writeString(stream, this.getFullId());
        McpeUtil.writeString(stream, this.getArmSize());
        McpeUtil.writeString(stream, this.getColor());

        // Hack to keep less useless data in software
        if (this.isPersona()) {
            stream.writeUnsignedIntLE(this.getPersonaData().getPieces().size);
            for (const personaPiece of this.getPersonaData().getPieces()) {
                McpeUtil.writeString(stream, personaPiece.getPieceId());
                McpeUtil.writeString(stream, personaPiece.getPieceType());
                McpeUtil.writeString(stream, personaPiece.getPackId());
                stream.writeBoolean(personaPiece.isDefault());
                McpeUtil.writeString(stream, personaPiece.getProductId());
            }

            stream.writeUnsignedIntLE(this.getPersonaData().getTintColors().size);
            for (const tint of this.getPersonaData().getTintColors()) {
                McpeUtil.writeString(stream, tint.getPieceType());
                stream.writeUnsignedIntLE(tint.getColors().length);
                for (const color of tint.getColors()) {
                    McpeUtil.writeString(stream, color);
                }
            }
        } else {
            stream.writeUnsignedIntLE(0); // Persona pieces
            stream.writeUnsignedIntLE(0); // Tint colors
        }

        stream.writeBoolean(this.isPremium());
        stream.writeBoolean(this.isPersona());
        stream.writeBoolean(this.isCapeOnClassicSkin());
        stream.writeBoolean(true); // Is primary user
    }

    public getId(): string {
        return this.id;
    }

    public getFullId(): string {
        return this.fullId ?? this.getCape().getId() + this.getId();
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
