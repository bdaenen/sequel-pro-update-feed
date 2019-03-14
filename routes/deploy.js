let express = require('express');
let router = express.Router();
let parser = require('xml2js');
let fs = require('fs');
let util = require('util');

/* GET home page. */
router.post('/', function(req, res, next) {
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
        data.release.assets.forEach(function(asset) {
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
            try {
                fetchAndAppendXmlToReleases(
                  xmlFile.browser_download_url,
                  (distFile && distFile.browser_download_url) || undefined,
                  function(){
                    res.json({
                        success: true
                    });
                  }
                );
            } catch(err) {
                res.json({
                    success: false,
                    message: err
                })
            }
        }
        else {
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
function fetchAndAppendXmlToReleases(xmlFileUrl, distFileUrl, callback) {
    const https = require('https');

    https.get(xmlFileUrl, function(res) {
        let xml = '';

        res.on('data', function(chunk) {
            xml += chunk;
        });

        res.on('error', function(e) {
            appendXmlToReleases(e, null);
        });

        res.on('timeout', function(e) {
            appendXmlToReleases(e, null);
        });

        res.on('end', function() {
            appendXmlToReleases(null, {xml: xml, distFileUrl: distFileUrl, callback: callback});
        });
    });
}

function appendXmlToReleases(err, data) {
    if (err) {
        return console.err(err);
    }

    parser.parseString(data.xml, function(err, jsonObj){
        let oldXml = fs.readFileSync('./public/releases.xml');
        parser.parseString(oldXml.toString(), function(err, oldJsonObj){
            if (!Array.isArray(oldJsonObj.rss.channel[0].item)) {
                oldJsonObj.rss.channel[0].item = [oldJsonObj.rss.channel[0].item];
            }

            if (!Array.isArray(jsonObj.rss.channel[0].item)) {
                jsonObj.rss.channel[0].item = [jsonObj.rss.channel[0].item];
            }

            jsonObj.rss.channel[0].item.forEach(function(item) {
                if (data.distFileUrl) {
                    item.enclosure[0].$.url = data.distFileUrl;
                }
                oldJsonObj.rss.channel[0].item.unshift(item);
            });


            let builder = new parser.Builder();
            fs.writeFileSync('./public/releases.xml', builder.buildObject(oldJsonObj));

            if (data.callback) {
                data.callback.call();
            }
        });

    });
}

module.exports = router;
