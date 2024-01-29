const mongoose = require('mongoose')
const Schema = mongoose.Schema


const Attachment = mongoose.model(
    "Attachment",  new Schema({
        filePath: String,
        filename: String,
        uuid: String,
        size: Number,
        height: Number,
        width: Number,
        extension: String,
        format: String,
        content_type: String,
        uploader: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        channel: {
            type: Schema.Types.ObjectId,
            ref: 'Channel',
        },
        createdAt: {
            type: Date,
            default: Date.now,
        }
    })
)

module.exports = Attachment