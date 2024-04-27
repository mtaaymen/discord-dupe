const express = require('express')
const router = express.Router()

const fs = require('fs')
const multer = require('multer')
const crypto = require('crypto')

const { authJwt } = require('../middlewares')
const db = require("../models")

const Avatar = db.avatar
const User = db.user


function uuidv4() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    )
}

const avatarStorage = multer.diskStorage({
    destination: './media/avatars/',
    filename: (req, file, cb) => {
        let uniqueFilename = false
        let newFileName

        while (!uniqueFilename) {
            newFileName = `${uuidv4()}-${file.originalname}`

            const existingDocument = fs.existsSync(`./media/avatars/${newFileName}`)
            if (!existingDocument) uniqueFilename = true
        }

        cb(null, newFileName)
    }
})

const avatarFileFilter = (req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg' || file.mimetype === 'image/gif') {
        // Accept the file
        cb(null, true)
    } else {
        // Reject the file
        cb(new Error('Only PNG, JPEG, JPG, and GIF files are allowed.'))
    }
}

const uploadAvatar = multer({ storage: avatarStorage, fileFilter: avatarFileFilter })


router.patch( '/upload', authJwt, uploadAvatar.single('avatar'), async (req, res) => {
    try {
        const userId = req.user._id.toString()
        if(!req.file) return res.status(400).send({ message: "File not found.", avatar: true })

        let uniqueIdentifier = false
        let newIdentifier

        while (!uniqueIdentifier) {
            newIdentifier = uuidv4()

            const existingDocument = await Avatar.findOne({identifier: newIdentifier})
            if (!existingDocument) uniqueIdentifier = true
        }

        let oldAvatarImage
        let newAvatar
        const foundAvatar = await Avatar.findOne({ user: userId })
        if( foundAvatar ) {
            oldAvatarImage = foundAvatar.image
            foundAvatar.identifier = newIdentifier
            foundAvatar.image = req.file.filename
            const updatedAvatar = await foundAvatar.save()
            newAvatar = updatedAvatar
        } else {
            newAvatar = await Avatar.create({
                image: req.file.filename,
                user: userId,
                identifier: newIdentifier
            })
        }

        await User.findOneAndUpdate({_id: userId}, {
            avatar: newIdentifier
        })
    
        req.io.emit("USER_UPDATE", {
            userId,
            updates: {
                avatar: newIdentifier
            }
        })

        if( oldAvatarImage ) {
            const imageExists = fs.existsSync(`./media/avatars/${oldAvatarImage}`)
            if( imageExists ) {
                fs.unlinkSync(`./media/avatars/${oldAvatarImage}`)
            }
        }

        res.end()
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )


function isValidUuidFormat(uuid) {
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(uuid);
}

router.get( '/:avatarId', async (req, res) => {
    try {
        const { avatarId } = req.params
        res.setHeader('Content-Type', 'image/jpeg')

        if( avatarId === "defaultAvatar" ) {
            fs.createReadStream('./media/DefaultSocial.png').pipe(res)
            return
        }

        if (!isValidUuidFormat(avatarId)) return res.status(400).json({ message: 'Invalid avatar id' })

        const foundAvatar = await Avatar.findOne({identifier: avatarId})
        if (!foundAvatar) return res.status(400).json({ message: 'Avatar not found' })

        const imageExists = fs.existsSync(`./media/avatars/${foundAvatar.image}`)
        if( imageExists ) {
            fs.createReadStream(`./media/avatars/${foundAvatar.image}`).pipe(res)
        } else {
            await User.findOneAndUpdate({_id: foundAvatar.user}, {avatar: 'defaultAvatar'})
            fs.createReadStream(`./media/DefaultSocial.png`).pipe(res)
        }
        
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )



module.exports = router