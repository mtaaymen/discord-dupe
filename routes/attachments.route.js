const express = require('express')
const router = express.Router()

const fs = require('fs')
const Readable = require('stream').Readable
const path = require('path')
const sharp = require('sharp')

const { authJwt } = require('../middlewares')
const config = require('../config')
const db = require("../models")
const Message = require('../models/message.model')

const Attachment = db.attachment
const User = db.user

router.get( '/:channelId/:attachmentId/:fileName' ,async (req, res) => {
    try {
        const { channelId, attachmentId, fileName } = req.params
        const { ex, width, height } = req.query

        if (!db.mongoose.Types.ObjectId.isValid(channelId)) return res.status(400).json({ message: 'Invalid channel id' })
        if (!db.mongoose.Types.ObjectId.isValid(attachmentId)) return res.status(400).json({ message: 'Invalid attachment id' })

        const attachmentDoc = await Attachment.findOne({
            _id: attachmentId,
            filename: fileName,
            channel: channelId,
            extension: ex
        })

        if( !attachmentDoc ) return res.status(404).send('File not found')

        const filePath = `./media/attachments/${attachmentDoc.filePath}`

        if (fs.existsSync(filePath)) {
            if(attachmentDoc?.content_type?.startsWith('image') && attachmentDoc?.format !== 'gif') {
                let imageStream = fs.createReadStream(filePath)
                if (width && height) {
                    imageStream = imageStream.pipe(sharp().resize(Number(width), Number(height)))
                }
                imageStream.pipe(res)
                return
            }

            if (!attachmentDoc?.content_type?.startsWith('image') && !attachmentDoc?.content_type?.startsWith('video')) {
                const downloadFileName = encodeURIComponent(attachmentDoc.filename)
                res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`)
            }
            
            const fileStream = fs.createReadStream(filePath)
            fileStream.pipe(res)
        } else {
            await Attachment.findByIdAndDelete(attachmentDoc._id)
            const attachmentMessage = await Message.findOne({ attachments: attachmentDoc._id })
            if( !attachmentMessage ) return res.status(404).send('File not found')

            const newMessageAttachments = attachmentMessage.attachments.filter( attachment => attachment.toString() !== attachmentDoc._id.toString() )
            if( newMessageAttachments.length === 0 && attachmentMessage.content.trim().length === 0 ) {
                await Message.findByIdAndDelete(attachmentMessage._id)

                req.io.to(`channel:${channelId}`).emit('MESSAGE_DELETE',{
                    message: attachmentMessage._id.toString(),
                    channel: channelId,
                    server: attachmentMessage?.server
                })
            } else {
                const updatedMessage = await Message.findByIdAndUpdate(attachmentMessage._id, { attachments: newMessageAttachments }, {new: true})
                    .populate([
                        {
                            path: 'hasReply',
                            select: 'content author'
                        }, {
                            path: 'mention_roles',
                            select: 'name color'
                        }, {
                            path: 'attachments',
                            select: 'filename size extension channel format width height content_type'
                        }
                    ])
                    .exec()
        
                const newUpdatedMessageAttachments = updatedMessage.attachments.map( attachment => {
                    return {
                        filename: attachment.filename,
                        size: attachment.size,
                        url: `${config.BASE_URL}/attachments/${attachment.channel.toString()}/${attachment._id}/${attachment.filename}?ex=${attachment.extension}&format=${attachment.format}`,
                        _id: attachment._id,
                        height: attachment.height,
                        width: attachment.width,
                        format: attachment.format,
                        content_type: attachment.content_type
                    }
                } )
        
                const updatedMessageObject = updatedMessage.toObject()
                updatedMessageObject.attachments = newUpdatedMessageAttachments
        
                if (!updatedMessage) return res.status(404).send('Message not found')
        
                req.io.to(`channel:${channelId}`).emit('MESSAGE_UPDATE', updatedMessageObject)
            }

            res.status(404).send('File not found')
        }
        
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
} )



module.exports = router