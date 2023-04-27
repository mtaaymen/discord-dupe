const mongoose = require('mongoose')
mongoose.Promise = global.Promise;


const db = {}
db.mongoose = mongoose

db.user = require("./user.model")
//db.userSettings = require("./userSettings.model")
db.guild = require("./guild.model")
db.channel = require("./channel.model")
db.message = require("./message.model")
db.role = require("./role.model")
db.invite = require("./invite.model")
db.dmChannel = require("./dmChannel.model")

module.exports = db