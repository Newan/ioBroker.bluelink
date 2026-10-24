"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBrandEnvironment = void 0;
const constants_1 = require("../constants");
const stamps_1 = require("./stamps");
const getEndpoints = (baseUrl, clientId) => ({
    session: `${baseUrl}/api/v1/user/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(`${baseUrl}/api/v1/user/oauth2/redirect`)}&lang=en`,
    login: `${baseUrl}/api/v1/user/signin`,
    language: `${baseUrl}/api/v1/user/language`,
    redirectUri: `${baseUrl}/api/v1/user/oauth2/redirect`,
    token: `${baseUrl}/api/v1/user/oauth2/token`,
    integration: `${baseUrl}/api/v1/user/integrationinfo`,
    silentSignIn: `${baseUrl}/api/v1/user/silentsignin`,
});
const getHyundaiEnvironment = ({ stampMode, stampsFile, }) => {
    const host = 'au-apigw.ccs.hyundai.com.au:8080';
    const baseUrl = `https://${host}`;
    const clientId = '855c72df-dfd7-4230-ab03-67cbf902bb1c';
    const appId = 'f9ccfdac-a48d-4c57-bd32-9116963c24ed'; // Android app ID
    return {
        brand: 'hyundai',
        host,
        baseUrl,
        clientId,
        appId,
        endpoints: Object.freeze(getEndpoints(baseUrl, clientId)),
        basicToken: 'Basic ODU1YzcyZGYtZGZkNy00MjMwLWFiMDMtNjdjYmY5MDJiYjFjOmU2ZmJ3SE0zMllOYmhRbDBwdmlhUHAzcmY0dDNTNms5MWVjZUEzTUpMZGJkVGhDTw==',
        stamp: (0, stamps_1.getStampGenerator)({
            appId,
            brand: 'hyundai',
            mode: stampMode,
            region: constants_1.REGIONS.AU,
            stampHost: 'https://raw.githubusercontent.com/neoPix/bluelinky-stamps/master/',
            stampsFile: stampsFile,
        }),
    };
};
const getKiaEnvironment = ({ stampMode, stampsFile, }) => {
    const host = 'au-apigw.ccs.kia.com.au:8082';
    const baseUrl = `https://${host}`;
    const clientId = '8acb778a-b918-4a8d-8624-73a0beb64289';
    const appId = '4ad4dcde-be23-48a8-bc1c-91b94f5c06f8'; // Android app ID
    return {
        brand: 'hyundai',
        host,
        baseUrl,
        clientId,
        appId,
        endpoints: Object.freeze(getEndpoints(baseUrl, clientId)),
        basicToken: 'Basic OGFjYjc3OGEtYjkxOC00YThkLTg2MjQtNzNhMGJlYjY0Mjg5OjdTY01NbTZmRVlYZGlFUEN4YVBhUW1nZVlkbFVyZndvaDRBZlhHT3pZSVMyQ3U5VA==',
        stamp: (0, stamps_1.getStampGenerator)({
            appId,
            brand: 'kia',
            mode: stampMode,
            region: constants_1.REGIONS.AU,
            stampHost: 'https://raw.githubusercontent.com/neoPix/bluelinky-stamps/master/',
            stampsFile: stampsFile,
        }),
    };
};
const getBrandEnvironment = ({ brand, stampMode = stamps_1.StampMode.LOCAL, stampsFile, }) => {
    switch (brand) {
        case 'hyundai':
            return Object.freeze(getHyundaiEnvironment({ stampMode, stampsFile }));
        case 'kia':
            return Object.freeze(getKiaEnvironment({ stampMode, stampsFile }));
        default:
            throw new Error(`Constructor ${brand} is not managed.`);
    }
};
exports.getBrandEnvironment = getBrandEnvironment;
