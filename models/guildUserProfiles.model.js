const mongoose = require('mongoose')
const Schema = mongoose.Schema


const GuildUserProfiles = mongoose.model(
    "GuildUserProfiles",  new Schema({
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        guild: {
            type: Schema.Types.ObjectId,
            ref: 'Guild',
        },
        nick: {
            type: String,
            default: '',
        },
        bio: {
            type: String,
            default: '',
        },
        present: {
            type: Boolean,
            default: true
        },
        banned: {
            type: Boolean,
            default: false,
        },
        bans : [{
            type: Schema.Types.ObjectId,
            ref: 'GuildBans',
        }],
        messages_count: {
            type: Number,
            default: 0
        },
        lastActive: {
            type: Date,
            default: new Date(),
        },
        createdAt: {
            type: Date,
            default: new Date(),
        }
    })
)

module.exports = GuildUserProfiles