const SkinPersonaPiece = require('./PersonaPiece');
const PieceTintColor = require('./PieceTintColor');


class SkinPersona {

    /** @type {Set<SkinPersonaPiece>} */
    pieces = new Set()

    /** @type {Set<PieceTintColor>} */
    tintColors = new Set()

}
module.exports = SkinPersona;      
