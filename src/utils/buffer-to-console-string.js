function bufferToConsoleString(buf) {
    return `<Buffer ${Buffer.from(buf).toJSON().data.map(i=>i.toString(16).padStart(2,'0')).join(' ')}>`
}

module.exports = bufferToConsoleString