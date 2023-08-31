const { Web3 } = require('web3')
const config = require('../config')
const { checkTransactionStatus } = require('../services')

const web3 = new Web3(new Web3.providers.HttpProvider(config.WEB3_PROVIDER))

//console.log( web3.eth.accounts.wallet.create(2) )

const walletsTest = [
    {
        address: '0xea66C3B97eA6d31d9E3EE036fC919E0607f0562b',
        privateKey: '0xe74fa99a92ed9e59c88b33db3966365e8bc1546428ca360189a7ed6adc18847f'
    },
    {
        address: '0x7a2e85a54E13f5F15A1F49945c836f290d7f05AA',
        privateKey: '0x0261d15a6f83bf61d82975b4e5f0c420cde12df12ca7fbc8d076cde998e4edbf'
    }
]

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


function getExchangeRate() {
    return new Promise( async ( resolve, reject ) => {
        try {
            const data = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
                .then( res => res.json() )

            const usdToEthRate = data?.ethereum?.usd
            if( !usdToEthRate ) return reject(null)

            resolve( usdToEthRate )
            console.log(`Current ETH/USD exchange rate: 1 ETH = $${usdToEthRate}`)
        } catch (error) {
            reject(null)
            console.error('Error fetching exchange rates:', error.message)
        }
    })
}


router.get( '/subscriptions', authJwt, async ( req, res ) => {
    try {
        const subscriptionsList = await Subscriptions.find({})

        res.status( 200 ).send(subscriptionsList)
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
} )

router.post( '/completeTransaction', authJwt, async ( req, res ) => {
    const productPriceUSD = 50
    //const recieverAddress = "0xea66C3B97eA6d31d9E3EE036fC919E0607f0562b"
    const recieverAddress = "0xc7b6692256bf5a7308e6D6A69B90a790C1fA0A05"

    try {
        const userId = req.user._id.toString()
        const {
            address,
            privateKey,
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
        

        if (!web3.utils.isAddress(address)) return res.status(400).send({ address: 'Invalid address.' })

        const usdToEthExchangeRate = await getExchangeRate()

        const weiSenderBalance = await web3.eth.getBalance(address)
        const ethSenderBalance = web3.utils.fromWei(weiSenderBalance, 'ether')

        const ethAmount = subscription.plans[Number(plan)].price / usdToEthExchangeRate

        const gasPrice = await web3.eth.getGasPrice()

        console.log("senderBalance:", ethSenderBalance, '<', "ethAmount:", ethAmount)
        if (ethSenderBalance < ethAmount) return res.status(400).json({ message: 'Insufficient balance to complete transaction.' })

        const nonce = await web3.eth.getTransactionCount(address, 'pending')

        const transactionObject = {
            nonce: nonce,
            to: recieverAddress,
            value: web3.utils.toWei(ethAmount.toString(), 'ether'),
            gas: 21000,
            gasPrice: gasPrice.toString(),
        }

        const senderWallet = web3.eth.accounts.privateKeyToAccount(privateKey)

        if( !address || address !== senderWallet.address ) return res.status(400).json({ message: "Private key doesn't match." })

        const signedTransaction = await senderWallet.signTransaction(transactionObject)
        const txHash = await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction)

        const txId = web3.utils.sha3( `${txHash.from}-${txHash.to}-${txHash.value}-${txHash.gas}` )

        if( txHash?.status ) {

            await TransactionsQueue.create({
                transactionHash: txHash.transactionHash,
                user: userId,
                subscriptionId: subscriptionId,
                plan: plan,
                status: 'confirmed'
            })

            await UserSubscriptions.create({
                user: userId,
                subscription: subscriptionId,
                plan: plan
            })

            await User.findOneAndUpdate( {_id: userId}, { $addToSet: { badges: subscription.badge } } )

            return res.status( 200 ).send({
                status: 'confirmed',
                transactionID: txId
            })
        }


        await TransactionsQueue.create({
            transactionHash: txHash.transactionHash,
            user: userId,
            subscriptionId: subscriptionId,
            plan: plan
        })

        if (!global.transactionsInterval) {
            // Start the background process if not already running
            global.transactionsInterval = setInterval(checkTransactionStatus, 5000, req.io)
        }

        res.status( 200 ).send({
            status: 'pending',
            transactionID: txId
        })
    } catch (error) {
        console.error(error)
        return res.status(500).json({ message: 'Internal server error' })
    }
} )

module.exports = router