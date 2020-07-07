'use strict'

/**
 * Runs a callback function in async mode
 * 
 * @param {Function} callback 
 */
function Async(callback) {
    return new Promise((resolve, reject) => {
        setImmediate(() => {
            try {
                resolve(callback())
            } catch (e) {
                reject(e)
            }
        })
    })
}
module.exports = Async