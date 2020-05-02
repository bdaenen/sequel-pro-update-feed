let express = require('express');
let router = express.Router();
let parser = require('xml2js');
const aws = require('aws-sdk');
const s3 = new aws.S3();
const {BUCKET} = process.env;

router.post('/', async function (req, res, next) {
        let data = req.body;
        // Only handle release publications
        if (data.action === 'published' && data.release && data.release.draft === false && data.release.assets && data.release.assets.length) {
            let xmlFile;
            let distFile;
            let xmlFileContentTypes = [
                    'text/xml',
                    'application/xml',
                ]
            ;
            let distFileContentTypes = [
                    'application/zip',
                    'application/octet-stream',
                    'application/x-zip-compressed',
                    'multipart/x-zip',
                    'application/x-rar-compressed'
                ]
            ;
            // Find the XML describing the update and the dist zip.
            data.release.assets.forEach(function (asset) {
                if (distFile && xmlFile) {
                    return;
                }
                if (xmlFileContentTypes.includes(asset.content_type)) {
                    xmlFile = asset;
                    return;
                }
                if (distFileContentTypes.includes(asset.content_type)) {
                    distFile = asset;
                    return;
                }
            });

            // If we found an XML file, update the existing XML.
            if (xmlFile) {
                    let success = await fetchAndAppendXmlToReleases(
                        xmlFile.browser_download_url,
                        (distFile && distFile.browser_download_url) || undefined
                    );

                    res.json({
                        success
                    });

            } else {
                res.json({
                    success: false,
                    message: 'No XML file found.'
                })
            }
        }
});

/**
 * Updates the XML with the latest version, and updates the path of the distribution to the github URL.
 * @param xmlFileUrl
 * @param distFileUrl
 */
function fetchAndAppendXmlToReleases(xmlFileUrl, distFileUrl) {
    return new Promise((resolve) => {
        const request = require('request');
        request(xmlFileUrl, function (error, response, body) {
            if (error) {
                console.error(error);
                throw error;
            }
            resolve(appendXmlToReleases({xml: body, distFileUrl: distFileUrl}))
        });
    });
}

function appendXmlToReleases(data) {
    return new Promise((resolve, reject) => {
        parser.parseString(data.xml, function (err, jsonObj) {
            if (err) console.log(err);
            s3.getObject({Bucket: BUCKET, Key: 'releases.xml'}, (err, data) => {
                if (err) {
                    console.log(err);
                    reject(err);
                }

                /** @type Buffer */
                let oldXml = data.Body;
                parser.parseString(oldXml.toString('utf-8'), function (err, oldJsonObj) {
                    if (err) {
                        console.log(err);
                        reject(err)
                    }
                    if (!Array.isArray(oldJsonObj.rss.channel[0].item)) {
                        oldJsonObj.rss.channel[0].item = [oldJsonObj.rss.channel[0].item];
                    }

                    if (!Array.isArray(jsonObj.rss.channel[0].item)) {
                        jsonObj.rss.channel[0].item = [jsonObj.rss.channel[0].item];
                    }

                    jsonObj.rss.channel[0].item.forEach(function (item) {
                        if (data.distFileUrl) {
                            item.enclosure[0].$.url = data.distFileUrl;
                        }
                        oldJsonObj.rss.channel[0].item.unshift(item);
                    });

                    let builder = new parser.Builder();

                    s3.putObject({
                        Bucket: BUCKET,
                        Key: 'releases.xml',
                        Body: Buffer.from(builder.buildObject(oldJsonObj), 'utf-8')
                    }, (err, data) => {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        resolve(true);
                    });
                });
            });
        });
    })
}

module.exports = router;
