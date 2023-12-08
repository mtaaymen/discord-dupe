function encodeColor(rgbOrHex) {
    if (typeof rgbOrHex === 'string') {
        if (rgbOrHex[0] === '#') {
            rgbOrHex = hexToRgb(rgbOrHex)
        } else {
            rgbOrHex = parseRgbString(rgbOrHex)
        }
      
        return (rgbOrHex.r << 16) + (rgbOrHex.g << 8) + rgbOrHex.b
    }
    
    return rgbOrHex
}

function decodeColor(encodedColor) {
    const r = (encodedColor >> 16) & 0xFF
    const g = (encodedColor >> 8) & 0xFF
    const b = encodedColor & 0xFF
    
    return `rgb(${r}, ${g}, ${b})`
}

function hexToRgb(hex, isString) {
    hex = hex.replace(/^#/, '')

    const bigint = parseInt(hex, 16)

    const r = (bigint >> 16) & 255
    const g = (bigint >> 8) & 255
    const b = bigint & 255
  
    if(isString) return `rgb(${r}, ${g}, ${b})`
    return { r, g, b }
}
  
function parseRgbString(rgbString) {
    const match = rgbString.match(/(\d+),\s*(\d+),\s*(\d+)/)
    if (match) {
        return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) }
    } else {
        return { r: 0, g: 0, b: 0 }
    }
}

function isEncodedColor(value) {
    return Number.isInteger(value) && value >= 0 && value <= 16777215
}

module.exports = {
    encodeColor,
    decodeColor,
    isEncodedColor
}