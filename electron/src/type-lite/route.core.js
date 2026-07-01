const Router = require('express');
const fs = require('fs');
const { encrypt, decrypt } = require('./crypto.utils.js');

const createCoreRouter = ({ savePath }) => {
    const CoreRouter = Router();

    CoreRouter.post('/connecting', async (req, res) => {
        port = req.body.port;

        if (req.body.statusTypeLite) {
            appToken = req.body.appToken;
        } else {
            appToken = null;
        }

        fs.writeFileSync(savePath, encrypt(JSON.stringify(req.body)), 'utf-8');

        res.json({
            connected: req.body.statusTypeLite
        });
    });

    CoreRouter.post('/check/status', async (req, res) => {
        fs.readFile(savePath, 'utf-8', async (err, content) => {
            if (!err && content !== 'null') {
                try {
                    const decryptedContent = decrypt(content);
                    const config = JSON.parse(decryptedContent);
                    if (req.body.appToken && req.body.appToken === config.appToken) {
                        res.status(200).send({
                            checked: true
                        });
                    } else {
                        res.status(500).send({
                            checked: false
                        });
                    }
                } catch(e) {
                    res.status(500).send({ checked: false });
                }
            } else {
                res.status(300).send({
                    checked: false
                });
            }
        });
    });

    return CoreRouter;
}

module.exports = createCoreRouter;
