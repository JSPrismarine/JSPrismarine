import SkinImage from './SkinImage';
import SkinAnimation from './SkinAnimation';
import SkinPersona from './skin-persona/Persona';
import SkinPersonaPiece from './skin-persona/PersonaPiece';
import SkinPersonaPieceTintColor from './skin-persona/PieceTintColor';
import SkinCape from './SkinCape';

class Skin {

    /** @type {string} */
    id
    /** @type {string} */
    resourcePatch
    /** @type {SkinImage} */
    image
    /** @type {Set<SkinAnimation>} */
    animations = new Set()
    /** @type {SkinCape} */
    cape
    /** @type {string} */
    geometry
    /** @type {string} */
    animationData
    /** @type {boolean} */
    isPremium
    /** @type {boolean} */
    isPersona
    /** @type {boolean} */
    isCapeOnClassicSkin
    /** @type {string} */
    color
    /** @type {string} */
    armSize
    /** @type {SkinPersona} */
    persona
    /**
     * Full skin ID, computed because
     * not sent on JWT.
     * 
     * @type {string}
     */
    fullId
    /** @type {boolean} */
    isTrusted = true

    /**
     * Loads a skin from a JSON file contianing skin data 
     * using minecraft bedrock login fields.
     * 
     * (loads the skin persona)
     * @param {object} jwt 
     */
    static fromJWT(jwt) {  
        let skin = new Skin();

        // Read skin 
        skin.id = jwt.SkinId;
        skin.resourcePatch = Buffer.from(
            jwt.SkinResourcePatch, 'base64'
        ).toString();
        skin.image = new SkinImage({
            width: jwt.SkinImageWidth,
            height: jwt.SkinImageHeight,
            data: Buffer.from(jwt.SkinData, 'base64')
        });
        skin.color = jwt.SkinColor;
        skin.armSize = jwt.ArmSize;

        // Read animations
        for (let animation of jwt.AnimatedImageData) {
            skin.animations.add(new SkinAnimation({
                image: new SkinImage({
                    width: animation.ImageWidth,
                    height: animation.ImageHeight,
                    data: animation.Image  
                }),
                frames: animation.Frames,
                type: animation.Type
            }));
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
        skin.geometry = Buffer.from(
            jwt.SkinGeometryData, 'base64'
        ).toString();

        // TODO: Most of the times is empty, figure out what is it 
        skin.animationData = Buffer.from(jwt.SkinAnimationData, 'base64');

        // Read skin boolean properties
        skin.isPremium = jwt.PremiumSkin;
        skin.isPersona = jwt.PersonaSkin;
        skin.isCapeOnClassicSkin = jwt.CapeOnClassicSkin;

        // Avoid reading when skin is not persona type
        if (skin.isPersona) { 
            skin.persona = new SkinPersona();

            // Read persona pieces
            for (let personaPiece of jwt.PersonaPieces) {
                skin.persona.pieces.add(new SkinPersonaPiece({
                    isDefault: personaPiece.IsDefault,
                    packId: personaPiece.PackId,
                    pieceId: personaPiece.PieceId,
                    pieceType: personaPiece.PieceType, 
                    productId: personaPiece.ProductId
                }));  
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
export default Skin;