const emojiBase = require('../emoji.json')

const diversitiesList = [
    "",
    "\u{1F3FB}", //# light skin tone
    "\u{1F3FC}", //# medium-light skin tone
    "\u{1F3FD}", //# medium skin tone
    "\u{1F3FE}", //# medium-dark skin tone
    "\u{1F3FF}", //# dark skin tone
]

const findEmoji = emojiId => {
    const fullEmojiBase = getFullEmojiesWithTones();

    let foundEmoji
    fullEmojiBase.some(category => {
        return category.items.some(item => {
            if (decodeURIComponent(item.emoji) === emojiId) {
                foundEmoji = item
                return true
            } else if (item?.tones) {
                return item.tones.some(emojiTone => {
                    if (decodeURIComponent(emojiTone) === emojiId) {
                        foundEmoji = {
                            ...item,
                            emoji: emojiTone
                        }
                        return true
                    }
                })
            }
        })
    })

    return foundEmoji
}
const getFullEmojiesWithTones = () => {
    const ItemsWithTones = emojiBase.map( c => {
        return {
            ...c,
            items: c.items.map( emoji => {
                if( !emoji.skin_tones ) return emoji

                const VARIATION_SELECTOR_16 = '\ufe0f'
                const ZERO_WIDTH_JOINER = '\u200d'
                const PEOPLE_HOLDING_HANDS = '\ud83e\udd91\u200d\u2764\u200d\ud83e\udd91'
        
                // Define a regular expression to match emoji characters
                var emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]/g;
              
                // Replace each emoji character with its HTML entity representation
                var htmlString = emoji.emoji.replace(emojiRegex, function(match) {
                    return '&#x' + match.codePointAt(0).toString(16) + ';'
                })
                
        
                const rawNormalized = htmlString.replace(/\ufe0f/g, '')
                const idx = rawNormalized.indexOf('\u200d')
        
                const emojiDiversities = diversitiesList.map(modifier => {
                    if (rawNormalized === PEOPLE_HOLDING_HANDS) {
                        // Special case to apply the modifier to both persons
                        return rawNormalized.slice(0, idx) + modifier + rawNormalized.slice(idx) + modifier;
                    } else if (idx !== -1) {
                        // Insert modifier before zero-width joiner
                        return rawNormalized.slice(0, idx) + modifier + rawNormalized.slice(idx);
                    } else {
                        return rawNormalized + modifier;
                    }
                })

                return {
                    ...emoji,
                    tones: emojiDiversities
                }
            } )
        }
    } )

    return ItemsWithTones
}

module.exports = {
    findEmoji
}