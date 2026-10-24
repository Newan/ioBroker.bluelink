"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStampGenerator = exports.getStampFromCFB = exports.getStampFromFile = exports.StampMode = void 0;
const fs_1 = require("fs");
const util_1 = require("util");
const got_1 = __importDefault(require("got"));
const australia_cfb_1 = require("./australia.cfb");
const europe_cfb_1 = require("./europe.cfb");
const constants_1 = require("../constants");
var StampMode;
(function (StampMode) {
    StampMode["LOCAL"] = "LOCAL";
    StampMode["DISTANT"] = "DISTANT";
})(StampMode || (exports.StampMode = StampMode = {}));
const cachedStamps = new Map();
const getAndCacheStampsFromFile = async (file, stampHost, stampsFile = `${stampHost}${file}.v2.json`) => {
    if (stampsFile.startsWith('file://')) {
        const [, path] = stampsFile.split('file://');
        const content = await (0, util_1.promisify)(fs_1.readFile)(path);
        return JSON.parse(content.toString('utf-8'));
    }
    const { body } = await (0, got_1.default)(stampsFile, { json: true });
    cachedStamps.set(file, body);
    return body;
};
const getStampFromFile = (stampFileKey, stampHost, stampsFile) => async () => {
    const { stamps, generated, frequency } = cachedStamps.get(stampFileKey) ??
        (await getAndCacheStampsFromFile(stampFileKey, stampHost, stampsFile));
    const generatedDate = new Date(generated);
    const millisecondsSinceStampsGeneration = Date.now() - generatedDate.getTime();
    const position = Math.floor(millisecondsSinceStampsGeneration / frequency);
    if (position / (stamps.length - 1) >= 0.9) {
        cachedStamps.delete(stampFileKey);
    }
    return stamps[Math.min(position, stamps.length - 1)];
};
exports.getStampFromFile = getStampFromFile;
const xorBuffers = (a, b) => {
    if (a.length !== b.length) {
        throw new Error(`XOR Buffers are not the same size ${a.length} vs ${b.length}`);
    }
    const outBuffer = Buffer.alloc(a.length);
    for (let i = 0; i < outBuffer.length; i++) {
        outBuffer.writeUInt8(a[i] ^ b[i], i);
    }
    return outBuffer;
};
const getCFB = (brand, region) => {
    switch (region) {
        case constants_1.REGIONS.AU:
            return brand === 'kia' ? australia_cfb_1.kiaCFB : australia_cfb_1.hyundaiCFB;
        case constants_1.REGIONS.EU:
            return brand === 'kia' ? europe_cfb_1.kiaCFB : europe_cfb_1.hyundaiCFB;
        default:
            throw new Error('Local stamp generation is only supported in Australia and Europe');
    }
};
const getStampFromCFB = (appId, brand, region) => {
    const cfb = getCFB(brand, region);
    return async () => {
        const rawData = Buffer.from(`${appId}:${Date.now()}`, 'utf-8');
        return Promise.resolve(xorBuffers(cfb, rawData).toString('base64'));
    };
};
exports.getStampFromCFB = getStampFromCFB;
const getStampGenerator = ({ appId, brand, mode, region, stampHost, stampsFile, }) => {
    switch (mode) {
        case StampMode.LOCAL:
            return (0, exports.getStampFromCFB)(appId, brand, region);
        case StampMode.DISTANT:
        default:
            return (0, exports.getStampFromFile)(`${brand}-${appId}`, stampHost, stampsFile);
    }
};
exports.getStampGenerator = getStampGenerator;
