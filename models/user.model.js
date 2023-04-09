const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const User = mongoose.model(
    "User",
    new Schema({
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 2,
            maxlength: 32,
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
        avatar: {
            type: String,
            default: 'default-avatar-url'
        },
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
        friendRequests: [{
            type: Schema.Types.ObjectId,
            ref: 'User',
        }],
        mutedChannels: [{
            type: Schema.Types.ObjectId,
            ref: 'Channel',
        }],
        servers: [{
            type: Schema.Types.ObjectId,
            ref: 'Server',
        }],
        mutedServers: [{
            type: Schema.Types.ObjectId,
            ref: 'Server',
        }],
        discriminator: {
            type: String,
            required: true,
            minlength: 4,
            maxlength: 4,
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
        createdAt: {
            type: Date,
            default: Date.now,
        },
    })
);

module.exports = User
