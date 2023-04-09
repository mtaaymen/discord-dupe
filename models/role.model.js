const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const Role = mongoose.model(
    "Role",
    new Schema({
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
  })
)

module.exports = Role