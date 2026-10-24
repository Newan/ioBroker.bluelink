"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSession = void 0;
const tough_cookie_1 = require("tough-cookie");
async function initSession(environment, cookies) {
    const cookieJar = cookies ?? new tough_cookie_1.CookieJar();
    //!!!// await got(environment.endpoints.session, { cookieJar });
    // Language endpoint now requires authentication, so we skip it
    // Language will be set in the authentication URL instead
    return cookieJar;
}
exports.initSession = initSession;
