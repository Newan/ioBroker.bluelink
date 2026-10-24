"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uuidV4 = exports.asyncMap = exports.manageBluelinkyError = exports.ManagedBluelinkyError = void 0;
const got_1 = __importDefault(require("got"));
const { HTTPError, ParseError } = got_1.default;
class ManagedBluelinkyError extends Error {
    constructor(message, source) {
        super(message);
        this.source = source;
        this.name = ManagedBluelinkyError.ErrorName;
    }
}
exports.ManagedBluelinkyError = ManagedBluelinkyError;
ManagedBluelinkyError.ErrorName = 'ManagedBluelinkyError';
const manageBluelinkyError = (err, context) => {
    if (err instanceof HTTPError) {
        return new ManagedBluelinkyError(`${context ? `@${context}: ` : ''}[${err.statusCode}] ${err.statusMessage} on [${err.method}] ${err.url} - ${JSON.stringify(err.body)}`, err);
    }
    if (err instanceof ParseError) {
        return new ManagedBluelinkyError(`${context ? `@${context}: ` : ''} Parsing error on [${err.method}] ${err.url} - ${JSON.stringify(err.response?.body)}`, err);
    }
    if (err instanceof Error) {
        return err;
    }
    return err;
};
exports.manageBluelinkyError = manageBluelinkyError;
const asyncMap = async (array, callback) => {
    const mapped = [];
    for (let index = 0; index < array.length; index++) {
        mapped.push(await callback(array[index], index, array));
    }
    return mapped;
};
exports.asyncMap = asyncMap;
const uuidV4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0, v = c == 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
});
exports.uuidV4 = uuidV4;
