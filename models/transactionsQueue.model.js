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
        transactionHash: String,
        subscriptionId: {
            type: Schema.Types.ObjectId,
            ref: 'Subscriptions'
        },
        plan: Number,
        createdAt: {
            type: Date,
            default: Date.now,
        }
    })
)

module.exports = TransactionsQueue