'use strict';
const serverless = require('serverless-http');
const express = require('express');
const crypto = require('crypto');
const bufferEq = require('buffer-equal-constant-time');
const deployRouter = require('./routes/deploy');
const aws = require('aws-sdk');
const s3 = new aws.S3();
const {SECRETS_BUCKET} = process.env;
const dotenv = require('dotenv');
const logger = require('morgan');
const SECRETS_PATH = 'sqlpro-update-feed/.env';

const app = express();
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/deploy', async function(req, res, next) {
    if (!req.headers['x-hub-signature']) {
        res.status(403);
        res.json({message: 'Forbidden'});
        return;
    }

    try {
        if (!(await verifySignature(JSON.stringify(req.body), req.headers['x-hub-signature']))) {
            console.log('bad secret');
            res.status(403);
            res.json({'message': 'Invalid secret.'});
            console.log('Bad secret received from', req.headers.origin);
        }
        else {
            next();
        }
    }
    catch (err) {
        console.log(err);
        res.json(err)
    }
});

app.use('/deploy', deployRouter);

function verifySignature(data, signature) {
    return new Promise((resolve, reject) => {
        s3.getObject({Bucket: SECRETS_BUCKET, Key: SECRETS_PATH}, (err, envFile) => {
            if (err) {
                console.log(err);
                reject(err);
            }

            try {
                let env = dotenv.parse(envFile.Body);
                resolve(bufferEq(new Buffer.from(signature), Buffer.from(signData(env.GITHUB_SECRET, data))));
            }
            catch (err) {
                console.log(err);
            }
        });
    })
}

function signData(secret, data) {
    return 'sha1=' + crypto.createHmac('sha1', secret).update(data).digest('hex')
}

module.exports.deploy = serverless(app);