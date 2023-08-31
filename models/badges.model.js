const mongoose = require('mongoose')
const Schema = mongoose.Schema


const Badges = mongoose.model(
    "Badges",  new Schema({
        icon: String,
        id: String,
        description: String,
        createdAt: {
            type: Date,
            default: Date.now,
        }
    })
)

module.exports = Badges