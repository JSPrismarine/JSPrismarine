import SkinPersonaPiece from './SkinPersonaPiece.js';
import SkinPersonaPieceTintColor from './SkinPersonaPieceTintColor.js';

export default class SkinPersona {
    private readonly pieces: Set<SkinPersonaPiece> = new Set();
    private readonly tintColors: Set<SkinPersonaPieceTintColor> = new Set();

    public getPieces(): Set<SkinPersonaPiece> {
        return this.pieces;
    }

    public getTintColors(): Set<SkinPersonaPieceTintColor> {
        return this.tintColors;
    }
}
