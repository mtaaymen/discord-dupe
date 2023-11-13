const mongoose = require('mongoose')
const Schema = mongoose.Schema

const passwordResetSchema = new mongoose.Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    email: {
        type: String,
        required: true,
    },
    code: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 86400
    }
})

//passwordResetSchema.index({ createdAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 })

const passwordReset = mongoose.model( 'passwordReset', passwordResetSchema )


module.exports = passwordReset