"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChineseLegacyAuthStrategy = void 0;
const got_1 = __importDefault(require("got"));
const china_authStrategy_1 = require("./china.authStrategy");
const url_1 = __importDefault(require("url"));
class ChineseLegacyAuthStrategy {
    constructor(environment) {
        this.environment = environment;
    }
    get name() {
        return 'ChineseLegacyAuthStrategy';
    }
    async login(user, options) {
        const cookieJar = await (0, china_authStrategy_1.initSession)(this.environment, options?.cookieJar);
        const { body, statusCode } = await (0, got_1.default)(this.environment.endpoints.login, {
            method: 'POST',
            json: true,
            body: {
                'email': user.username,
                'password': user.password,
            },
            cookieJar,
        });
        if (!body.redirectUrl) {
            throw new Error(`@ChineseLegacyAuthStrategy.login: sign In didn't work, could not retrieve auth code. status: ${statusCode}, body: ${JSON.stringify(body)}`);
        }
        const { code } = url_1.default.parse(body.redirectUrl, true).query;
        if (!code) {
            throw new Error('@ChineseLegacyAuthStrategy.login: AuthCode was not found, you probably need to migrate your account.');
        }
        return {
            code: code,
            cookies: cookieJar,
        };
    }
}
exports.ChineseLegacyAuthStrategy = ChineseLegacyAuthStrategy;
