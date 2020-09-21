const SkinPersonaPiece = require('./persona-piece')
const PieceTintColor = require('./piece-tint-color')

'use strict'

class SkinPersona {

    /** @type {Set<SkinPersonaPiece>} */
    pieces = new Set()

    /** @type {Set<PieceTintColor>} */
    tintColors = new Set()

}
module.exports = SkinPersona      