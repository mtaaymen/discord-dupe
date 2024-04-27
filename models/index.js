const config = require('../config')
const mongoose = require('mongoose')
mongoose.Promise = global.Promise

const conn = mongoose.createConnection(config.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })

const db = {}

conn.once('open', () => {
    db.gfs = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'uploads' })
})


db.mongoose = mongoose

db.user = require("./user.model")
//db.userSettings = require("./userSettings.model")
db.guild = require("./guild.model")
db.channel = require("./channel.model")
db.message = require("./message.model")
db.role = require("./role.model")
//db.invite = require("./invite.model")
db.transactionsQueue = require("./transactionsQueue.model")
db.subscriptions = require("./subscriptions.model")
db.userSubscriptions = require("./userSubscriptions.model")
db.badges = require("./badges.model")
db.guildUserProfiles = require("./guildUserProfiles.model")
db.guildBans = require("./guildBans.model")
db.passwordReset = require("./passwordReset.model")
db.attachment = require("./attachment.model")
//db.rateLimit = require("./RateLimit.model")
db.avatar = require("./avatar.model")

module.exports = db