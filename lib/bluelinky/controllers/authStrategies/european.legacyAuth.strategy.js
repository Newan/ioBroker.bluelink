"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EuropeanLegacyAuthStrategy = void 0;
const got_1 = __importDefault(require("got"));
const authStrategy_1 = require("./authStrategy");
const url_1 = __importDefault(require("url"));
class EuropeanLegacyAuthStrategy {
    constructor(environment, language) {
        this.environment = environment;
        this.language = language;
    }
    get name() {
        return 'EuropeanLegacyAuthStrategy';
    }
    async login(user, options) {
        const cookieJar = await (0, authStrategy_1.initSession)(this.environment, options?.cookieJar);
        const { body, statusCode } = await (0, got_1.default)(this.environment.endpoints.loginURL, {
            method: 'POST',
            json: true,
            body: {
                'email': user.username,
                'password': user.password,
            },
            cookieJar,
        });
        if (!body.redirectUrl) {
            throw new Error(`@EuropeanLegacyAuthStrategy.login: sign In didn't work, could not retrieve auth code. status: ${statusCode}, body: ${JSON.stringify(body)}`);
        }
        const { code } = url_1.default.parse(body.redirectUrl, true).query;
        if (!code) {
            throw new Error('@EuropeanLegacyAuthStrategy.login: AuthCode was not found, you probably need to migrate your account.');
        }
        return {
            code: code,
            cookies: cookieJar,
        };
    }
}
exports.EuropeanLegacyAuthStrategy = EuropeanLegacyAuthStrategy;
