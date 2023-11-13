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
        last_message_id: {
            type: Schema.Types.ObjectId,
            ref: 'Message',
        },
        lastTimestamp: {
            type: Number,
            default: Date.now,
        },
        participants: [{
            type: Schema.Types.ObjectId,
            ref: 'User',
        }],
        owner: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        isGroup: {
            type: Boolean,
            default: false
        },
        permissions: {
            roles: [{
                allow: {
                    type: Number,
                    default: 0
                },
                deny: {
                    type: Number,
                    default: 0
                },
                _type: {
                    type: Number,
                    default: 0,
                    enum: [0],
                },
                id: {
                    type: Schema.Types.ObjectId,
                    ref: 'Role'
                },
                position: Number
            }],
            users: [{
                allow: {
                    type: Number,
                    default: 0
                },
                deny: {
                    type: Number,
                    default: 0
                },
                _type: {
                    type: Number,
                    default: 1,
                    enum: [1],
                },
                id: {
                    type: Schema.Types.ObjectId,
                    ref: 'User'
                },
                position: Number
            }]
        },
        rate_limit_per_user: {
            type: Number,
            enum: [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600],
            default: 0
        },
        createdAt: {
            type: Date,
            default: Date.now,
        }
    })
)


module.exports = Channel