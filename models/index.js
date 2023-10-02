const config = require('../config')
const { GridFsStorage } = require('multer-gridfs-storage')
const multer = require('multer')
const mongoose = require('mongoose')
mongoose.Promise = global.Promise

const conn = mongoose.createConnection(config.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })

const db = {}

conn.once('open', () => {
    db.gfs = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'uploads' })
})

const storage = new GridFsStorage({
    url: config.MONGODB_URI,
    file: (req, file) => {
        return new Promise((resolve, reject) => {
            const fileInfo = {
                filename: file.originalname,
                bucketName: 'uploads'
            }
            resolve(fileInfo)
        })
    }
})
db.avatarUpload = multer({ storage })


db.mongoose = mongoose

db.user = require("./user.model")
//db.userSettings = require("./userSettings.model")
db.guild = require("./guild.model")
db.channel = require("./channel.model")
db.message = require("./message.model")
db.role = require("./role.model")
db.invite = require("./invite.model")
db.transactionsQueue = require("./transactionsQueue.model")
db.subscriptions = require("./subscriptions.model")
db.userSubscriptions = require("./userSubscriptions.model")
db.badges = require("./badges.model")
db.guildUserProfiles = require("./guildUserProfiles.model")
db.guildBans = require("./guildBans.model")
//db.avatar = require("./avatar.model")

module.exports = db