"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston = __importStar(require("winston"));
const defaultLevel = process.env.LOG_LEVEL || 'info';
const { colorize, json, combine, timestamp, printf } = winston.format;
const myFormat = printf(({ level, message, timestamp }) => {
    // convert objects into strings
    if (['array', 'object'].includes(typeof message)) {
        message = JSON.stringify(message, null, 2);
    }
    return `[${timestamp}] ${level}: ${message}`;
});
const combinedFormats = combine(timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
}), colorize(), json(), myFormat);
const logger = winston.createLogger({
    format: combinedFormats,
    level: defaultLevel,
    transports: [new winston.transports.Console({})],
});
exports.default = logger;
