const mongoose = require('mongoose')
const Schema = mongoose.Schema


const Avatar = mongoose.model(
    "Avatar",  new Schema({
        image: String,
        identifier: {
            type: String,
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        createdAt: {
            type: Date,
            default: Date.now,
        }
    })
)

module.exports = Avatar