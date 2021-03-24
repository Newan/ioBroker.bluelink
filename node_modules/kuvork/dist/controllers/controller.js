// changed this to interface so we can have option things?
export class SessionController {
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
//# sourceMappingURL=controller.js.map