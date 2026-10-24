"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AustraliaAuthStrategy = void 0;
const got_1 = __importDefault(require("got"));
const tough_cookie_1 = require("tough-cookie");
const url_1 = __importDefault(require("url"));
class AustraliaAuthStrategy {
    constructor(environment) {
        this.environment = environment;
    }
    get name() {
        return 'AustraliaAuthStrategy';
    }
    async login(user, options) {
        const cookieJar = options?.cookieJar ?? new tough_cookie_1.CookieJar();
        await (0, got_1.default)(this.environment.endpoints.session, { cookieJar });
        const { body: bodyStr, statusCode } = await (0, got_1.default)(this.environment.endpoints.login, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({
                'email': user.username,
                'password': user.password,
                'mobileNum': '',
            }),
            cookieJar,
        });
        const body = JSON.parse(bodyStr);
        if (!body.redirectUrl) {
            throw new Error(`@AustraliaAuthStrategy.login: sign In didn't work, could not retrieve auth code. status: ${statusCode}, body: ${JSON.stringify(body)}`);
        }
        const { code } = url_1.default.parse(body.redirectUrl, true).query;
        if (!code) {
            throw new Error('@AustraliaAuthStrategy.login: AuthCode was not found, you probably need to migrate your account.');
        }
        return {
            code: code,
            cookies: cookieJar,
        };
    }
}
exports.AustraliaAuthStrategy = AustraliaAuthStrategy;
