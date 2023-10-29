const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Role = mongoose.model(
    "Role",
    new Schema({
        mentionable: Boolean,
        hoist: Boolean,
        description: String,
        name: {
            type: String,
            required: true
        },
        server: {
            type: Schema.Types.ObjectId,
            ref: 'Server',
            required: true
        },
        color: {
            type: String
        },
        members: [
            {
                type: Schema.Types.ObjectId,
                ref: 'User'
            }
        ],
        permissions: Number,
        createdAt: {
            type: Date,
            default: Date.now,
        },
  })
)

module.exports = Role