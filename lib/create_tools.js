
class Create_tools {
    constructor(adapter) {
        this.adapter = adapter;
    }
    async setControlObjects(vin) {
        await this.adapter.setObjectNotExistsAsync(vin + '.control.charge', {
            type: 'state',
            common: {
                name: 'Start charging',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
                def: true,
            },
            native: {},
        });
        this.adapter.subscribeStates(vin + '.control.charge');

        await this.adapter.setObjectNotExistsAsync(vin + '.control.charge_stop', {
            type: 'state',
            common: {
                name: 'Stop charging',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
                def: true,
            },
            native: {},
        });
        this.adapter.subscribeStates(vin + '.control.charge_stop');

        await this.adapter.setObjectNotExistsAsync(vin + '.control.lock', {
            type: 'state',
            common: {
                name: 'Lock the vehicle',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
                def: true,
            },
            native: {},
        });
        this.adapter.subscribeStates(vin + '.control.lock');

        await this.adapter.setObjectNotExistsAsync(vin + '.control.unlock', {
            type: 'state',
            common: {
                name: 'Unlock the vehicle',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
                def: true,
            },
            native: {},
        });
        this.adapter.subscribeStates(vin + '.control.unlock');

        if (this.adapter.config.motor == 'EV' || this.adapter.config.motor == 'HEV') {
            await this.adapter.setObjectNotExistsAsync(vin + '.control.force_checkDriveInfo', {
                type: 'state',
                common: {
                    name: 'Force load Drive Infos',
                    type: 'boolean',
                    role: 'button',
                    read: true,
                    write: true,
                    def: true,
                },
                native: {},
            });

            this.adapter.subscribeStates(vin + '.control.force_checkDriveInfo');
        }

        if (this.adapter.config.motor == 'EV') {
            await this.adapter.setObjectNotExistsAsync(vin + '.control.clima.start', {
                type: 'state',
                common: {
                    name: 'Start clima for the vehicle',
                    type: 'boolean',
                    role: 'button',
                    read: true,
                    write: true,
                    def: true,
                },
                native: {},
            });
            this.adapter.subscribeStates(vin + '.control.clima.start');

            await this.adapter.setObjectNotExistsAsync(vin + '.control.clima.set.defrost', {
                type: 'state',
                common: {
                    name: 'set defrost function for clima',
                    type: 'boolean',
                    role: 'state',
                    read: true,
                    write: true,
                    def: false,
                },
                native: {},
            });

            await this.adapter.setObjectNotExistsAsync(vin + '.control.clima.set.heating', {
                type: 'state',
                common: {
                    name: 'set heating  1 or 0',
                    type: 'number',
                    role: 'state',
                    read: true,
                    write: true,
                    def: 0,
                },
                native: {},
            });

            await this.adapter.setObjectNotExistsAsync(vin + '.control.clima.set.airTemp', {
                type: 'state',
                common: {
                    name: 'set Vehicle air tempereature',
                    type: 'number',
                    role: 'indicator',
                    read: true,
                    write: true,
                    def: 18,
                },
                native: {},
            });

            await this.adapter.setObjectNotExistsAsync(vin + '.control.clima.stop', {
                type: 'state',
                common: {
                    name: 'Stop clima for the vehicle',
                    type: 'boolean',
                    role: 'button',
                    read: true,
                    write: true,
                    def: true,
                },
                native: {},
            });
            this.adapter.subscribeStates(vin + '.control.clima.stop');
        }
        await this.adapter.setObjectNotExistsAsync(vin + '.control.force_refresh_from_car', {
            type: 'state',
            common: {
                name: 'Force refresh vehicle status from car',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
                def: true,
            },
            native: {},
        });
        this.adapter.subscribeStates(vin + '.control.force_refresh_from_car');

        await this.adapter.setObjectNotExistsAsync(vin + '.control.force_refresh_from_server', {
            type: 'state',
            common: {
                name: 'Force refresh vehicle status from server',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
                def: true,
            },
            native: {},
        });
        this.adapter.subscribeStates(vin + '.control.force_refresh_from_server');

        await this.adapter.setObjectNotExistsAsync(vin + '.control.force_refresh', {
            type: 'state',
            common: {
                name: 'Force refresh vehicle status',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
                def: true,
            },
            native: {},
        });
        this.adapter.subscribeStates(vin + '.control.force_refresh');

        await this.adapter.setObjectNotExistsAsync(vin + '.control.force_update', {
            type: 'state',
            common: {
                name: 'true = car, false = server',
                type: 'boolean',
                role: 'state',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });
        this.adapter.subscribeStates(vin + '.control.force_update');

        await this.adapter.setObjectNotExistsAsync(vin + '.control.force_login', {
            type: 'state',
            common: {
                name: 'Force login',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
                def: true,
            },
            native: {},
        });
        this.adapter.subscribeStates(vin + '.control.force_login');

        await this.adapter.setObjectNotExistsAsync(vin + '.control.batteryControlState12V', {
            type: 'state',
            common: {
                name: 'Set battery monitoring',
                type: 'number',
                role: 'state',
                read: true,
                write: true,
                def: 65,
            },
            native: {},
        });
        this.adapter.subscribeStates(vin + '.control.batteryControlState12V');
        //Charge
        await this.adapter.setObjectNotExistsAsync(vin + '.control.charge_limit_slow', {
            type: 'state',
            common: {
                name: 'Vehicle charge limit for slow charging',
                type: 'number',
                role: 'indicator',
                read: true,
                write: true,
                def: 100,
            },
            native: {},
        });
        this.adapter.subscribeStates(vin + '.control.charge_limit_slow');

        await this.adapter.setObjectNotExistsAsync(vin + '.control.charge_limit_fast', {
            type: 'state',
            common: {
                name: 'Vehicle charge limit for fast charging',
                type: 'number',
                role: 'indicator',
                read: true,
                write: true,
                def: 100,
            },
            native: {},
        });
        this.adapter.subscribeStates(vin + '.control.charge_limit_fast');
    }

    async setStatusObjects(vin) {
        await this.adapter.setObjectNotExistsAsync(vin + '.lastInfoUpdate', {
            type: 'state',
            common: {
                name: 'Date/Time of last information update',
                type: 'number',
                role: 'value.time',
                read: true,
                write: false
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.error_counter', {
            type: 'state',
            common: {
                name: 'error_counter',
                type: 'number',
                role: 'state',
                read: true,
                write: false,
                def: 0,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatusRaw', {
            type: 'channel',
            common: {
                name: 'Unformatted vehicle status',
            },
            native: {},
        });


        //Bereicht vehicleStatus
        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.doorLock', {
            type: 'state',
            common: {
                name: 'Vehicle doors locked',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.trunkOpen', {
            type: 'state',
            common: {
                name: 'Trunk open',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.hoodOpen', {
            type: 'state',
            common: {
                name: 'Hood open',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        //Doors open
        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.doorOpen.frontLeft', {
            type: 'state',
            common: {
                name: 'Door open front left open',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.doorOpen.frontRight', {
            type: 'state',
            common: {
                name: 'Door open front right open',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.doorOpen.backLeft', {
            type: 'state',
            common: {
                name: 'Door open back left open',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.doorOpen.backRight', {
            type: 'state',
            common: {
                name: 'Door open back right open',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.airCtrlOn', {
            type: 'state',
            common: {
                name: 'Vehicle air control',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.airTemp', {
            type: 'state',
            common: {
                name: 'Vehicle air tempereature',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.smartKeyBatteryWarning', {
            type: 'state',
            common: {
                name: 'Smart key battery Warning',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.washerFluidStatus', {
            type: 'state',
            common: {
                name: 'Washer fluid status',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.breakOilStatus', {
            type: 'state',
            common: {
                name: 'Breal oil status',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.steerWheelHeat', {
            type: 'state',
            common: {
                name: 'Steer wheel heat',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.sideBackWindowHeat', {
            type: 'state',
            common: {
                name: 'Side back window heat',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.dte', {
            type: 'state',
            common: {
                name: 'Vehicle total available range',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });
        if (this.adapter.config.motor == 'EV'
            await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.evModeRange', {
                type: 'state',
                common: {
                    name: 'Vehicle total available range for ev',
                    type: 'number',
                    role: 'indicator',
                    read: true,
                    write: false,
                },
                native: {},
            });
        }
        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.gasModeRange', {
            type: 'state',
            common: {
                name: 'Vehicle total available range for gas',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.minutes_to_charged', {
            type: 'state',
            common: {
                name: 'Vehicle minutes to charged',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,

            },
            native: {},
        });

        //Battery
        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.soc', {
            type: 'state',
            common: {
                name: 'Vehicle battery state of charge',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.charge', {
            type: 'state',
            common: {
                name: 'Vehicle charging',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.soh', {
            type: 'state',
            common: {
                name: 'SoH',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.plugin', {
            type: 'state',
            common: {
                name: 'Charger connected (UNPLUGED = 0, FAST = 1, PORTABLE = 2, STATION = 3)',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.soc-12V', {
            type: 'state',
            common: {
                name: 'Vehicle 12v battery state of charge',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.state-12V', {
            type: 'state',
            common: {
                name: 'Vehicle 12v battery State',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleStatus.battery.smartKeyBatteryWarning', {
            type: 'state',
            common: {
                name: 'Key battery',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });


        //Bereich vehicleLocation
        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleLocation.lat', {
            type: 'state',
            common: {
                name: 'Vehicle position latitude',
                type: 'number',
                role: 'value.gps.latitude',
                read: true,
                write: false,
                def: 0,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleLocation.lon', {
            type: 'state',
            common: {
                name: 'Vehicle position longitude',
                type: 'number',
                role: 'value.gps.longitude',
                read: true,
                write: false,
                def: 0,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleLocation.speed', {
            type: 'state',
            common: {
                name: 'Vehicle speed',
                type: 'number',
                role: 'value.speed',
                unit: 'km/h',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleLocation.position_url', {
            type: 'state',
            common: {
                name: 'Position URL',
                type: 'string',
                role: 'text.url',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.vehicleLocation.position_text', {
            type: 'state',
            common: {
                name: 'Position Text',
                type: 'string',
                role: 'text',
                read: true,
                write: false,
            },
            native: {},
        });

        //Bereich Odometer
        await this.adapter.setObjectNotExistsAsync(vin + '.odometer.value', {
            type: 'state',
            common: {
                name: 'Odometer value',
                type: 'number',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setObjectNotExistsAsync(vin + '.general', {
            type: 'channel',
            common: {
                name: 'General Information',
            },
            native: {},
        });
    }
}

module.exports = {
    Create_tools
};
