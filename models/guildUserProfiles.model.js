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
        banned: {
            type: Boolean,
            default: false,
        },
        messages_count: {
            type: Number,
            default: 0
        },
        createdAt: {
            type: Date,
            default: Date.now,
        }
    })
)

module.exports = GuildUserProfiles