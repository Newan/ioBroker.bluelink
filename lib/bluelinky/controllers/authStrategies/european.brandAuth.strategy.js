"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EuropeanBrandAuthStrategy = void 0;
const got_1 = __importDefault(require("got"));
const authStrategy_1 = require("./authStrategy");
const url_1 = require("url");
class EuropeanBrandAuthStrategy {
    constructor(environment, language) {
        this.environment = environment;
        this.language = language;
    }
    get name() {
        return 'EuropeanBrandAuthStrategy';
    }
    async login(user, options) {
        const cookieJar = await (0, authStrategy_1.initSession)(this.environment, options?.cookieJar);
        const uri = this.environment.loginFormHost + this.environment.endpoints.tokenURL;
        const headers = {
            'Content-type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 4.1.1; Galaxy Nexus Build/JRO03C) AppleWebKit/535.19 (KHTML, like Gecko) Chrome/18.0.1025.166 Mobile Safari/535.19_CCS_APP_AOS',
        };
        const formData = new url_1.URLSearchParams();
        formData.append('grant_type', 'refresh_token');
        formData.append('refresh_token', user.password);
        formData.append('client_id', this.environment.ccspServiceID);
        formData.append('client_secret', this.environment.ccspServiceSecret);
        const authResponse = await got_1.default.post(uri, {
            //      cookieJar,
            headers: headers,
            body: formData.toString(),
            followRedirect: true,
            throwHttpErrors: false,
        });
        if (authResponse.statusCode !== 200) {
            throw new Error(`@EuropeanBrandAuthStrategy.login: Could not get access_token from URL: ${uri}`);
        }
        const token = JSON.parse(authResponse.body);
        if (!token.refresh_token && user.password != '') {
            token.refresh_token = user.password;
        }
        //const code = '';
        return {
            code: token,
            cookies: cookieJar,
        };
    }
}
exports.EuropeanBrandAuthStrategy = EuropeanBrandAuthStrategy;
