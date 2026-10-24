"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBrandEnvironment = void 0;
const getEndpoints = (baseUrl) => ({
    login: `${baseUrl}/tods/api/lgn`,
    logout: `${baseUrl}/tods/api/lgout`,
    // Vehicle
    vehicleList: `${baseUrl}/tods/api/vhcllst`,
    vehicleInfo: `${baseUrl}/tods/api/sltvhcl`,
    status: `${baseUrl}/tods/api/lstvhclsts`,
    remoteStatus: `${baseUrl}/tods/api/rltmvhclsts`,
    // Car commands with preauth (PIN)
    lock: `${baseUrl}/tods/api/drlck`,
    unlock: `${baseUrl}/tods/api/drulck`,
    start: `${baseUrl}/tods/api/evc/rfon`,
    stop: `${baseUrl}/tods/api/evc/rfoff`,
    startCharge: `${baseUrl}/tods/api/evc/rcstrt`,
    stopCharge: `${baseUrl}/tods/api/evc/rcstp`,
    setChargeTarget: `${baseUrl}/tods/api/evc/setsoc`,
    locate: `${baseUrl}/tods/api/fndmcr`,
    hornlight: `${baseUrl}/tods/api/hornlight`,
    // System
    verifyAccountToken: `${baseUrl}/tods/api/vrfyacctkn`,
    verifyPin: `${baseUrl}/tods/api/vrfypin`,
    verifyToken: `${baseUrl}/tods/api/vrfytnc`,
});
const getEnvironment = (host) => {
    const baseUrl = `https://${host}`;
    return {
        host,
        baseUrl,
        origin: 'SPA',
        endpoints: Object.freeze(getEndpoints(baseUrl)),
    };
};
const getHyundaiEnvironment = () => {
    return {
        brand: 'hyundai',
        ...getEnvironment('mybluelink.ca'),
    };
};
const getKiaEnvironment = () => {
    return {
        brand: 'hyundai',
        ...getEnvironment('kiaconnect.ca'),
    };
};
const getBrandEnvironment = (brand) => {
    switch (brand) {
        case 'hyundai':
            return Object.freeze(getHyundaiEnvironment());
        case 'kia':
            return Object.freeze(getKiaEnvironment());
        default:
            throw new Error(`Constructor ${brand} is not managed.`);
    }
};
exports.getBrandEnvironment = getBrandEnvironment;
