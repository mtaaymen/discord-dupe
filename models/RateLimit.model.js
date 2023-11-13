const mongoose = require('mongoose')
const Schema = mongoose.Schema

const RateLimit = mongoose.model(
    'RateLimit', new mongoose.Schema({
        ip: {
            type: String,
            required: true,
        },
        windowMs: {
            type: Number,
            required: true,
        },
        hits: {
            type: Number,
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
            expires: 60 * 60 * 24,
        },
    })
)

module.exports = RateLimit