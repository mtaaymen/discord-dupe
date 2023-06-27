const express = require('express')
const ObjectId = require('mongodb').ObjectId
const router = express.Router()

const fs = require('fs')
const Readable = require('stream').Readable
const path = require('path')

const { authJwt } = require('../middlewares')
const config = require('../config')
const db = require("../models")

const Avatar = db.avatar
const User = db.user

router.patch( '/upload', authJwt, db.avatarUpload.single('avatar'), async (req, res) => {
    try {
        const userId = req.user._id.toString()
        if(!req.file) return res.status(400).send({ message: "File not found.", avatar: true })

        await User.updateOne({_id: userId}, { avatar: req.file.id.toString() })

        req.io.emit("USER_UPDATE", {
            userId,
            updates: {
                avatar: req.file.id.toString()
            }
        })

        res.end()
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )


router.get( '/:avatarId', async (req, res) => {
    try {
        const { avatarId } = req.params
        if (!db.mongoose.Types.ObjectId.isValid(avatarId)) return res.status(400).json({ message: 'Invalid avatar id' })

        if( !db.gfs ) return res.status(400).send({ message: "This is Awkward, please try again later.", gfs: true })
        const filesList = await db.gfs.find({ _id: new ObjectId(avatarId) }).toArray()
        if( !filesList.length ) return res.status(400).send({ message: "Avatar not found.", gfs: true })
        const firstFile = filesList[0]
        const readStream = db.gfs.openDownloadStream(firstFile._id)
        readStream.pipe(res)
        
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )



module.exports = router