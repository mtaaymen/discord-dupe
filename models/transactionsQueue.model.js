const mongoose = require('mongoose')
const Schema = mongoose.Schema


const TransactionsQueue = mongoose.model(
    "TransactionsQueue",  new Schema({
        status: {
            type: String,
            default: 'pending'
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        subscriptionId: {
            type: Schema.Types.ObjectId,
            ref: 'Subscriptions'
        },
        plan: Number,
        currency: String,
        amount: Number,
        sentAmount: Number,
        address: String,
        privateKey: String,
        createdAt: {
            type: Date,
            default: Date.now,
        }
    })
)

module.exports = TransactionsQueue