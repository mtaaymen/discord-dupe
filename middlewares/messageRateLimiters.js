const rateLimit = require('express-rate-limit')

const limiters = []

const LimitersMarks = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600]


let hasRun = false

const makeRateLimiters = () => {
    if (!hasRun) {
        LimitersMarks.forEach( limitValue => {

            const limiter = rateLimit({
                store: new rateLimit.MemoryStore(),
                max: 1,
                windowMs: limitValue * 1000,
                skip: (req, res) => {
                    return !req.rateLimit || req.rateLimit !== limitValue
                },
                handler: (req, res, next) => {
                    const timeLeft = (req.rateLimit.resetTime - Date.now()) / 1000
                    res.status(429).json({
                        error: 'This action cannot be performed due to slowmode rate limit.',
                        timeLeft: timeLeft > 0 ? timeLeft : 0,
                    })
                },
            })

            limiters.push(limiter)
        } )

        hasRun = true
        return limiters
    } else return limiters
}


module.exports = makeRateLimiters
