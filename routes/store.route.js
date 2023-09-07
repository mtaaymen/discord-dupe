const { Web3 } = require('web3')
const config = require('../config')
const { checkTransactionStatus, getExchangeRate } = require('../services')

const web3 = new Web3(new Web3.providers.HttpProvider(config.WEB3_PROVIDER))

const express = require('express')
const router = express.Router()

const { authJwt } = require('../middlewares')

const db = require("../models")
const TransactionsQueue = db.transactionsQueue
const Subscriptions = db.subscriptions
const User = db.user
const UserSubscriptions = db.userSubscriptions

/*const SubsList = [
    {
        currency: 'US',
        currencyTag: '$',
        price: 50,
        tier: 4,
        tag: 'VIP',
        plans: [
            {
                title: 'Monthly',
                monthlySub: true,
                price: 50
            }
        ]
    }
]*/


router.get( '/subscriptions', authJwt, async ( req, res ) => {
    try {
        const subscriptionsList = await Subscriptions.find({})

        res.status( 200 ).send(subscriptionsList)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
} )

router.post( '/requestWallet', authJwt, async ( req, res ) => {
    try {
        const userId = req.user._id.toString()
        const {
            subscriptionId,
            plan,
            paymentType
        } = req.body

        if (!db.mongoose.Types.ObjectId.isValid(subscriptionId)) return res.status(400).json({ message: 'Invalid subscription id' })

        const subscription = await Subscriptions.findById(subscriptionId)
        if( !subscription ) return res.status(404).send({ message: 'Subscription not found'})

        if( isNaN(plan) ) return res.status(400).send({ address: 'Invalid plan.' })
        if( !subscription.plans[Number(plan)] ) return res.status(404).send({ message: 'Subscription plan not found'})

        const alreadySubbed = await UserSubscriptions.findOne({user: userId, subscription: subscriptionId})
        if( alreadySubbed && alreadySubbed.plan === plan ) return res.status(404).send({ message: 'User is already subscribed to this plan.'})

        const pendingWallet = await TransactionsQueue.findOne({
            status: 'pending',
            user: userId,
            subscriptionId: subscriptionId,
            plan: plan
        })

        if( pendingWallet ) {
            const responseData = {
                address: pendingWallet.address,
                amount: pendingWallet.amount,
                sessionStart: pendingWallet.createdAt
            }

            return res.status( 200 ).send(responseData)
        }

        const wallets = web3.eth.accounts.wallet.create(1)
        const wallet = wallets[0]

        const usdToEthExchangeRate = await getExchangeRate()
        const ethAmount = (subscription.plans[Number(plan)].price / usdToEthExchangeRate).toFixed(6)

        const newTransactionQueue = await TransactionsQueue.create({
            address: wallet.address,
            privateKey: wallet.privateKey,
            user: userId,
            subscriptionId: subscriptionId,
            plan: plan,
            currency: paymentType.name,
            amount: ethAmount
        })

        const responseData = {
            address: wallet.address,
            amount: ethAmount,
            sessionStart: newTransactionQueue.createdAt
        }


        res.status( 200 ).send(responseData)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
} )

router.post( '/testTransaction', authJwt, async ( req, res ) => {
    try {
        /*const { recieverAddress, address, amount, privateKey } = req.body

        const gasPrice = await web3.eth.getGasPrice()

        const nonce = await web3.eth.getTransactionCount(address, 'pending')

        const transactionObject = {
            nonce: nonce,
            to: recieverAddress,
            value: web3.utils.toWei(amount.toString(), 'ether'),
            gas: 21000,
            gasPrice: gasPrice.toString(),
        }

        const senderWallet = web3.eth.accounts.privateKeyToAccount(privateKey)
        const signedTransaction = await senderWallet.signTransaction(transactionObject)
        const txHash = await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction)

        console.log(txHash)*/

        res.status( 200 ).send('done')
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
} )

module.exports = router