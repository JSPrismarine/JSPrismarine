import SkinAnimation from './SkinAnimation';
import SkinCape from './SkinCape';
import SkinImage from './SkinImage';
import SkinPersona from './skin-persona/SkinPersona';
import SkinPersonaPiece from './skin-persona/SkinPersonaPiece';
import SkinPersonaPieceTintColor from './skin-persona/SkinPersonaPieceTintColor';

export default class Skin {
    public id!: string;
    public resourcePatch!: string;
    public image!: SkinImage;
    public animations: Set<SkinAnimation> = new Set();
    public cape!: SkinCape;
    public geometry!: string;
    public animationData!: string;
    public isPremium!: boolean;
    public isPersona!: boolean;
    public isCapeOnClassicSkin!: boolean;
    public color!: string;
    public armSize!: string;
    public persona!: SkinPersona;

    /**
     * Full skin ID, computed because
     * not sent on JWT.
     */
    public fullId!: string;
    public isTrusted: boolean = true;

    /**
     * Loads a skin from a JSON file contianing skin data
     * using minecraft bedrock login fields.
     *
     * (loads the skin persona)
     */
    static fromJWT(jwt: any): Skin {
        let skin = new Skin();

        // Read skin
        skin.id = jwt.SkinId;
        skin.resourcePatch = Buffer.from(
            jwt.SkinResourcePatch,
            'base64'
        ).toString();
        skin.image = new SkinImage({
            width: jwt.SkinImageWidth,
            height: jwt.SkinImageHeight,
            data: Buffer.from(jwt.SkinData, 'base64').toString()
        });
        skin.color = jwt.SkinColor;
        skin.armSize = jwt.ArmSize;

        // Read animations
        for (let animation of jwt.AnimatedImageData) {
            skin.animations.add(
                new SkinAnimation({
                    image: new SkinImage({
                        width: animation.ImageWidth,
                        height: animation.ImageHeight,
                        data: animation.Image
                    }),
                    frames: animation.Frames,
                    type: animation.Type,
                    expression: animation.AnimationExpression
                })
            );
        }

        // Read cape
        skin.cape = new SkinCape();
        skin.cape.id = jwt.CapeId;
        skin.cape.image = new SkinImage({
            width: jwt.CapeImageWidth,
            height: jwt.CapeImageHeight,
            data: Buffer.from(jwt.CapeData, 'base64').toString()
        });

        // TODO: make a class to manage geometry
        skin.geometry = Buffer.from(jwt.SkinGeometryData, 'base64').toString();

        // TODO: Most of the times is empty, figure out what is it
        skin.animationData = Buffer.from(
            jwt.SkinAnimationData,
            'base64'
        ).toString();

        // Read skin boolean properties
        skin.isPremium = jwt.PremiumSkin;
        skin.isPersona = jwt.PersonaSkin;
        skin.isCapeOnClassicSkin = jwt.CapeOnClassicSkin;

        // Avoid reading when skin is not persona type
        if (skin.isPersona) {
            skin.persona = new SkinPersona();

            // Read persona pieces
            for (let personaPiece of jwt.PersonaPieces) {
                skin.persona.pieces.add(
                    new SkinPersonaPiece({
                        isDefault: personaPiece.IsDefault,
                        packId: personaPiece.PackId,
                        pieceId: personaPiece.PieceId,
                        pieceType: personaPiece.PieceType,
                        productId: personaPiece.ProductId
                    })
                );
            }

            // Read piece tint colors
            for (let pieceTintColor of jwt.PieceTintColors) {
                let tintColor = new SkinPersonaPieceTintColor();
                tintColor.colors.push(...pieceTintColor.Colors);
                tintColor.pieceType = pieceTintColor.PieceType;
                skin.persona.tintColors.add(tintColor);
            }
        }

        // Compute a full id
        skin.fullId = skin.cape.id + skin.id;
        return skin;
    }
}
