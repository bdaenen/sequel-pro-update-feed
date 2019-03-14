let express = require('express');
let path = require('path');
let cookieParser = require('cookie-parser');
let logger = require('morgan');
const crypto = require('crypto');
const bufferEq = require('buffer-equal-constant-time');
const deployRouter = require('./routes/deploy');

let app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/deploy', function(req, res, next) {
    if (!verifySignature(JSON.stringify(req.body), req.headers['x-hub-signature'])) {
        res.status(403);
        res.json({'message': 'Invalid secret.'});
        console.error('Bad secret received from', req.headers.origin);
    }
    else {
        next();
    }
});
app.use('/deploy', deployRouter);


function verifySignature(data, signature) {
    console.log(typeof data, typeof signature);
    return bufferEq(new Buffer.from(signature), Buffer.from(signData(process.env.SECRET, data)));
}

function signData(secret, data) {
    return 'sha1=' + crypto.createHmac('sha1', secret).update(data).digest('hex');
}

module.exports = app;
