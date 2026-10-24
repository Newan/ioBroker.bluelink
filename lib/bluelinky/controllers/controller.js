"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionController = void 0;
// changed this to interface so we can have option things?
class SessionController {
    constructor(userConfig) {
        this.userConfig = userConfig;
        this.session = {
            accessToken: '',
            refreshToken: '',
            controlToken: '',
            deviceId: '',
            tokenExpiresAt: 0,
        };
    }
}
exports.SessionController = SessionController;
