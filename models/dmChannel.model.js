const mongoose = require('mongoose')
const Schema = mongoose.Schema

const dmChannelSchema = new mongoose.Schema({
    participants: [{
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        isVisible: { type: Boolean, default: true }
    }],
    messages: [{
        type: Schema.Types.ObjectId,
        ref: 'Message',
    }],
    isGroup: {
        type: Boolean,
        default: false
    },
})

const DMChannel = mongoose.model('DMChannel', dmChannelSchema)

module.exports = DMChannel