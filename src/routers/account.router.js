'use strict';

const accountModel = require('../DB/account.mongo');
const shortid = require('shortid');

const BaseRouter = require('./base.router');
const { HTTPCodes } = require('../utils/constants');

class AccountRouter extends BaseRouter {
    constructor() {
        super();

        // Get publickey
        this.get('/pubkey', async(req) => ({ pubkey: req.jwt.pubCert.toString() }));

        // User get, create, update, delete
        // Get all accounts
        this.get('/user', async() => ({ accounts: await accountModel.find({}) }));

        this.get('/user/:id', async(req) => {
            let account = await accountModel.findOne({ id: req.params.id });
            if (!account) return { status: HTTPCodes.NOT_FOUND, message: 'No account exists with this ID' };

            return { account };
        });
        this.delete('/user', async() => ({ status: HTTPCodes.BAD_REQUEST, message: 'No ID was passed' }));
        this.delete('/user/:id', async(req) => {
            let account = await accountModel.findOne({ id: req.params.id });
            if (!account) return { status: HTTPCodes.NOT_FOUND, message: 'No account exists with this ID' };

            await account.remove();
            return { account };
        });
        this.post('/user/create', async(req) => {
            if (!req.body || !req.body.name || !req.body.discordUserId) return { status: HTTPCodes.BAD_REQUEST, message: 'Missing name and or discordUserId' };
            let name = req.body.name;
            let discordUserId = req.body.discordUserId;
            let active = req.body.active !== undefined ? req.body.active : true;
            let scopes = req.body.scopes ? typeof req.body.scopes.map === 'function' ? req.body.scopes :req.body.scopes.toString().split(',') : [];

            let validate = this.validate(name, discordUserId, active, scopes);
            if (validate) return validate;

            let account = new accountModel({ id: shortid.generate(), name, discordUserId, active, tokens: [], scopes });
            await account.save();
            return { message: 'Account created successfully', account };
        });
        this.post('/user/update', async() => ({ status: HTTPCodes.BAD_REQUEST, message: 'No ID was passed' }));
        this.post('/user/update/:id', async(req) => {
            if (!req.body) return { status: HTTPCodes.BAD_REQUEST, message: 'No body was passed' };

            let account = await accountModel.findOne({ id: req.params.id });
            if (!account) return { status: HTTPCodes.NOT_FOUND, message: 'No account exists with this ID' };

            let modified = false;
            if (req.body.name) {
                account.name = req.body.name;
                modified = true;
            }
            if (req.body.discordUserId) {
                account.discordUserId = req.body.discordUserId;
                modified = true;
            }
            if (req.body.active !== undefined) {
                account.active = req.body.active;
                modified = true;
            }
            if (req.body.scopes) {
                account.scopes = req.body.scopes ? typeof req.body.scopes.map === 'function' ? req.body.scopes :req.body.scopes.toString().split(',') : [];
                modified = true;
            }

            if (!modified) return { account };
            let validate = this.validate(account.name, account.discordUserId, req.body.active !== undefined ? req.body.active : true, account.scopes);
            if (validate) return validate;

            await account.save();
            return { account };
        });

        // Token get, create, delete
        this.post('/token/create', async(req) => {
            if (!req.body || !req.body.userId) return { status: HTTPCodes.BAD_REQUEST, message: 'Missing user Id' };

            let account = await accountModel.findOne({ id: req.body.userId });
            if (!account) return { status: HTTPCodes.NOT_FOUND, message: 'No account exists with this Id' };

            let tokenId = shortid.generate();

            let token = await req.jwt.sign({ userId: account.id, tokenId });
            account.tokens.push(tokenId);
            await account.save();

            return { account, tokenId, token };
        });
        this.delete('/token', async() => ({ status: HTTPCodes.BAD_REQUEST, message: 'Missing token Id' }));
        this.delete('/token/:id', async(req) => {
            // TODO consider adding support for full JWT token
            let account = await accountModel.findOne({ tokens: req.params.id });
            if (!account) return { status: HTTPCodes.NOT_FOUND, message: 'No user with this token Id could be found' };

            let index = account.tokens.indexOf(req.params.id);
            if (index === -1) return HTTPCodes.INTERNAL_SERVER_ERROR;
            account.tokens.splice(index, 1);
            await account.save();

            return { account };
        });
        this.get('/validate', async() => ({ status: HTTPCodes.BAD_REQUEST, message: 'No token was passed' }));
        this.get('/validate/:token', async(req) => {
            let decoded;
            try {
                decoded = await req.jwt.verify(req.params.token);
            } catch (e) {
                if (e.message === 'jwt malformed') return { status: HTTPCodes.BAD_REQUEST, message: 'Malformed JWT' };
                if (e.message === 'invalid signature') return HTTPCodes.UNAUTHORIZED;
                if (e.message === 'invalid algorithm') return HTTPCodes.UNAUTHORIZED;
                console.log(e);
                throw e;
            }

            let account = await accountModel.findOne({ id: decoded.userId });
            if (!account) return { status: HTTPCodes.NOT_FOUND, message: 'No user with this token could be found' };
            if (account.tokens.indexOf(decoded.tokenId) === -1) return { status: HTTPCodes.NOT_FOUND, message: 'The token could not be found in the user' };

            return { iat: decoded.iat, account };
        });
    }

    isValidName(name) {
        return /^[a-zA-Z0-9_]*$/.test(name);
    }

    isValidSnowflake(snowflake) {
        return /^[0-9]*$/.test(snowflake);
    }

    isValidBoolean(boolean) {
        return boolean === true || boolean === false || boolean === 'true' || boolean === 'false';
    }

    validate(name, discordUserId, active, scopes) {
        if (!this.isValidName(name)) return { status: HTTPCodes.BAD_REQUEST, message: 'Invalid name' };
        if (!this.isValidSnowflake(discordUserId)) return { status: HTTPCodes.BAD_REQUEST, message: 'Invalid discordUserId' };
        if (!this.isValidBoolean(active)) return { status: HTTPCodes.BAD_REQUEST, message: 'Invalid active' };
        return null;
    }
}

module.exports = AccountRouter;
