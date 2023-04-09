const mongoose = require('mongoose')
const Schema = mongoose.Schema

const serverSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100,
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    description: {
        type: String,
        maxlength: 1000,
    },
    icon: {
        type: String,
        default: 'default-icon-url',
    },
    members: [{
        type: Schema.Types.ObjectId,
        ref: 'User',
    }],
    channels: [{
        type: Schema.Types.ObjectId,
        ref: 'Channel',
    }],
    roles: [{
        type: Schema.Types.ObjectId,
        ref: 'Role',
    }],
    emojis: [{
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 1,
            maxlength: 100,
        },
        url: {
            type: String,
            required: true,
            trim: true,
            minlength: 1,
            maxlength: 1000,
        },
    }],
    bans: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    invites: [{
        type: Schema.Types.ObjectId,
        ref: 'Invite'
    }],
    permissions: [{
        name: String,
        allowed: Boolean,
        allowedTo: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }, {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Role'
        }]
    }],
    createdAt: {
        type: Date,
        default: Date.now,
    }
})

/*serverSchema.pre('save', async function(next) {
    if (!this.isNew) {
      return next()
    }
  
    let code
    while (!code) {
      const tempCode = Math.random().toString(36).substr(2, 8)
      const doc = await this.constructor.findOne({ 'invites.code': tempCode })
      if (!doc) code = tempCode
    }
  
    this.invites.push({ code })
    next()
})*/

const Guild = mongoose.model( "Guild", serverSchema )

module.exports = Guild