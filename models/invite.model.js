const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Invite = mongoose.model(
    "Invite",
    new Schema({
        code: {
            type: String,
            unique: true,
            required: true
        },
        uses: {
            type: Number,
            default: 0,
        },
        maxUses: {
            type: Number,
            default: 0,
        },
        expiresAt: {
            type: Date,
        },
        maxAge: {
            type: Number,
        },
        isPermanent: {
            type: Boolean,
            default: false,
        },
        inviter: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        guild: {
            type: Schema.Types.ObjectId,
            ref: 'Guild',
        },
        channel: {
            type: Schema.Types.ObjectId,
            ref: 'Channel',
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    })
)

module.exports = Invite