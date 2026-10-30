import type SkinPersonaPiece from './SkinPersonaPiece';
import type SkinPersonaPieceTintColor from './SkinPersonaPieceTintColor';

/** Cosmetic persona pieces and their tint palettes in a serialized player skin. */
export default class SkinPersona {
    private readonly pieces: Set<SkinPersonaPiece> = new Set();
    private readonly tintColors: Set<SkinPersonaPieceTintColor> = new Set();

    /** Returns the cosmetic pieces that make up the persona skin. */
    public getPieces(): Set<SkinPersonaPiece> {
        return this.pieces;
    }

    /** Returns the tint palettes keyed by persona piece type. */
    public getTintColors(): Set<SkinPersonaPieceTintColor> {
        return this.tintColors;
    }
}
