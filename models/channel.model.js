const mongoose = require('mongoose')
const Schema = mongoose.Schema


const Channel = mongoose.model(
    "Channel",  new Schema({
        name: {
            type: String,
            trim: true,
            maxlength: 100,
        },
        type: {
            type: String,
            enum: ['text', 'voice', 'category', 'dm'],
            default: 'text',
        },
        position: {
            type: Number,
            required: true,
        },
        topic: {
            type: String,
            default: null,
        },
        nsfw: {
            type: Boolean,
            default: false,
        },
        server: {
            type: Schema.Types.ObjectId,
            ref: 'Guild'
        },
        parent: {
            type: Schema.Types.ObjectId,
            ref: 'Channel',
            default: null,
        },
        permissionOverwrites: [{
            type: Schema.Types.ObjectId,
            ref: 'PermissionOverwrite',
        }],
        messages: [{
            type: Schema.Types.ObjectId,
            ref: 'Message',
        }],
        participants: [{
            user: { type: Schema.Types.ObjectId, ref: 'User' },
            isVisible: { type: Boolean, default: true }
        }],
        isGroup: {
            type: Boolean,
            default: false
        },
        permissions: [{
            name: String,
            allowed: Boolean,
            allowedTo: [{
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }, {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Role'
            }]
        }],
        createdAt: {
            type: Date,
            default: Date.now,
        }
    })
)


module.exports = Channel