const mongoose = require('mongoose')
const db = require("../models")

const Guild = db.guild

const Schema = mongoose.Schema


const InviteSchema = new Schema({
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

const Invite = mongoose.model( "Invite", InviteSchema )

module.exports = Invite