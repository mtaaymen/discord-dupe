const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const Message = mongoose.model(
    "Message",
    new Schema({
        type: Number,
        content: {
            type: String,
            required: true,
        },
        author: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        channel: {
            type: Schema.Types.ObjectId,
            ref: 'Channel',
            required: true,
        },
        server: {
            type: Schema.Types.ObjectId,
            ref: 'Guild'
        },
        hasReply: {
            type: Schema.Types.ObjectId,
            ref: 'Message'
        },
        attachments: [{
            url: String,
            contentType: String,
            size: Number,
        }],
        embeds: [{
            type: String,
            title: String,
            description: String,
            url: String,
            timestamp: Date,
            color: Number,
            footer: {
                text: String,
                iconURL: String,
            },
            thumbnail: {
                url: String,
                height: Number,
                width: Number,
            },
            image: {
                url: String,
                height: Number,
                width: Number,
            },
            author: {
                name: String,
                url: String,
                iconURL: String,
            },
            fields: [{
                name: String,
                value: String,
                inline: Boolean,
            }],
        }],
        reactions: [{
            emoji: String,
            count: Number,
            users: [{
                type: Schema.Types.ObjectId,
                ref: 'User',
            }],
        }],
        pinned: {
            type: Boolean,
            default: false,
        },
        editedTimestamp: {
            type: Date,
            default: null,
        },
        deleted: {
            type: Boolean,
            default: false,
        },
        deletedTimestamp: {
            type: Date,
            default: null,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    })
)


module.exports = Message