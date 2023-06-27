const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const User = mongoose.model(
    "User",
    new Schema({
        username: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 32,
        },
        bio: {
            type: String,
            trim: true,
            maxlength: 191,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            maxlength: 100,
        },
        password: {
            type: String,
            required: true,
            minlength: 6,
            maxlength: 1000,
        },
        avatar: String,
        banner: String,
        status: {
            type: String,
            enum: ['online', 'offline', 'idle', 'dnd'],
            default: 'offline',
        },
        friends: [{
            type: Schema.Types.ObjectId,
            ref: 'User',
        }],
        blockedUsers: [{
            type: Schema.Types.ObjectId,
            ref: 'User',
        }],
        sentFriendRequests: [{
            type: Schema.Types.ObjectId,
            ref: 'User',
        }],
        pendingFriendRequests: [{
            type: Schema.Types.ObjectId,
            ref: 'User',
        }],
        mutedChannels: [{
            type: Schema.Types.ObjectId,
            ref: 'Channel',
        }],
        guilds: [{
            type: Schema.Types.ObjectId,
            ref: 'Guild',
        }],
        mutedServers: [{
            type: Schema.Types.ObjectId,
            ref: 'Guild',
        }],
        channels: [{
            type: Schema.Types.ObjectId,
            ref: 'Channel' 
        }],
        reputations: [{
            user: {
                type: Schema.Types.ObjectId,
                ref: 'User' 
            },
            reason: {
                type: String
            }
        }],
        reputationsCount: Number,
        givenReputations: [{
            type: Schema.Types.ObjectId,
            ref: 'User' 
        }],
        vouches: [{
            user: {
                type: Schema.Types.ObjectId,
                ref: 'User' 
            },
            reason: {
                type: String
            }
        }],
        vouchesCount: Number,
        givenVouches: [{
            type: Schema.Types.ObjectId,
            ref: 'User' 
        }],
        discriminator: {
            type: String,
            required: true,
            minlength: 4,
            maxlength: 4
        },
        uid: {
            type: Number,
            required: true,
            unique: true
        },
        locale: {
            type: String,
            default: 'en-US',
        },
        verified: {
            type: Boolean,
            default: false,
        },
        emailVerified: {
            type: Boolean,
            default: false,
        },
        mfaEnabled: {
            type: Boolean,
            default: false
        },
        mfa: {
            secret: String,
            enabledAt: Date,
        },
        phone: {
            type: String,
            default: null,
        },
        lastSeen: {
            type: Date,
        },
        dob: {
            type: Date,
        },
        token: {
            type: String,
        },
        version: {
            type: Number,
            default: 0
        },
        customStatus: {
            status: {
                type: String,
                enum: [ 'offline', 'idle', 'dnd', null],
                default: null
            },
            text: {
                type: String,
                default: null
            },
            emojiName: {
                type: String
            },
            emojiId: {
                type: String
            }
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    })
);

module.exports = User
