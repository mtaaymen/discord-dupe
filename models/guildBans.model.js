const mongoose = require('mongoose')
const Schema = mongoose.Schema


const GuildBans = mongoose.model(
    "GuildBans",  new Schema({
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        guild: {
            type: Schema.Types.ObjectId,
            ref: 'Guild',
        },
        issuer: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        reason: {
            type: String,
            default: 'no reason issued'
        },
        createdAt: {
            type: Date,
            default: new Date(),
        }
    })
)

module.exports = GuildBans