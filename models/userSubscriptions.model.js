const mongoose = require('mongoose')
const Schema = mongoose.Schema


const UserSubscriptions = mongoose.model(
    "UserSubscriptions",  new Schema({
        subscription: {
            type: Schema.Types.ObjectId,
            ref: 'Subscriptions'
        },
        plan: Number,
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        createdAt: {
            type: Date,
            default: Date.now,
        }
    })
)

module.exports = UserSubscriptions