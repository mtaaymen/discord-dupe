const mongoose = require('mongoose')
const Schema = mongoose.Schema


const Subscriptions = mongoose.model(
    "Subscriptions",  new Schema({
        disabled: {
            type: Boolean,
            default: false
        },
        subscribers: {
            type: Number,
            default: 0
        },
        currency: String,
        currencyTag: String,
        price: Number,
        tier: Number,
        tag: String,
        badge: {
            type: Schema.Types.ObjectId,
            ref: 'Badges'
        },
        plans: [
            {
                title: String,
                monthlySub: Boolean,
                yearlySub: Boolean,
                weeklySub: Boolean,
                price: Number,
                perks: {
                    type: Number,
                    default: 0
                },
            }
        ],
        createdAt: {
            type: Date,
            default: Date.now,
        }
    })
)

module.exports = Subscriptions