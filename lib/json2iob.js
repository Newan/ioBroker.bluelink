//v1.5b
/*
options:
write //set common write variable to true
forceIndex //instead of trying to find names for array entries, use the index as the name
channelName //set name of the root channel
preferedArrayName //set key to use this as an array entry name
autoCast (true false) // make JSON.parse to parse numbers correctly
descriptions: Object of names for state keys
*/
module.exports = class Json2iob {
    constructor(adapter) {
        this.adapter = adapter;
        this.alreadyCreatedObjects = {};
    }

    async parse(path, element, options = { write: false }) {
        if (element == null) {
            this.adapter.log.debug('Cannot extract empty: ' + path);
            return;
        }

        if (typeof element === 'string' || typeof element === 'number') {
            const name = element.toString();
            if (!this.alreadyCreatedObjects[path]) {
                try {
                    await this.adapter.setObjectNotExistsAsync(path, {
                        type: 'state',
                        common: {
                            name,
                            role: this.getRole(element, options.write),
                            type: typeof element,
                            write: options.write,
                            read: true,
                        },
                        native: {},
                    });
                    this.alreadyCreatedObjects[path] = true;
                } catch (error) {
                    this.adapter.log.error(error);
                }
            }
            this.adapter.setState(path, element, true);
            return;
        } else {
            options.channelName = this.getLastSegment(path);
        }

        if (!this.alreadyCreatedObjects[path]) {
            try {
                await this.adapter.setObjectNotExistsAsync(path, {
                    type: 'channel',
                    common: {
                        name: options.channelName || '',
                        write: false,
                        read: true,
                    },
                    native: {},
                });
                this.alreadyCreatedObjects[path] = true;
                delete options.channelName;
            } catch (error) {
                this.adapter.log.error(error);
            }
        }

        if (Array.isArray(element)) {
            await this.extractArray(element, '', path, options);
            return;
        }

        for (const key of Object.keys(element)) {
            const fullPath = `${path}.${key}`;
            const value = element[key];

            if (Array.isArray(value)) {
                try {
                    await this.extractArray(element, key, path, options);
                } catch (error) {
                    this.adapter.log.error('extractArray ' + error);
                }
                continue;
            }

            const isObj = this.isObject(value);
            const skipKey = this.adapter.config.motor === 'EV' && (key === 'start' || key === 'end');

            if (skipKey) {
                continue;
            } else {
                if (isObj) {
                    await this.parse(fullPath, value, options);
                    continue;
                }
            }

            if (!this.alreadyCreatedObjects[fullPath]) {
                const objectName = options.descriptions?.[key] || key;
                const type = value != null ? typeof value : 'mixed';

                await this.adapter.setObjectNotExistsAsync(fullPath, {
                    type: 'state',
                    common: {
                        name: objectName,
                        role: this.getRole(value, options.write),
                        type,
                        write: options.write,
                        read: true,
                    },
                    native: {},
                });
                this.alreadyCreatedObjects[fullPath] = true;
            }

            try {
                if (value !== undefined ) {
                    this.adapter.setState(fullPath, value, true);
                }
            } catch (err) {
                this.adapter.log.warn('ERROR ' + value + ' ' + JSON.stringify(err));
            }
        }
    }

    isObject(value) {
        return value !== null && typeof value === 'object';
    }

    async extractArray(element, key, path, options) {
        try {
            const array = key ? element[key] : element;

            for (let i = 0; i < array.length; i++) {
                const arrayElement = array[i];
                const index = (i + 1).toString().padStart(2, '0');
                let arrayPath = key + index;

                if (typeof arrayElement === 'string') {
                    await this.parse(`${path}.${key}.${arrayElement}`, arrayElement, options);
                    continue;
                }

                // Dynamische Pfadfindung anhand möglicher Felder
                const pathCandidates = [
                    'id', 'name', 'label', 'labelText', 'start_date_time',
                ];

                for (const field of pathCandidates) {
                    if (arrayElement[field]) {
                        arrayPath = arrayElement[field].replace(/\./g, '');
                    }
                }

                // Id-/Name-Felder priorisieren
                for (const [field, value] of Object.entries(arrayElement)) {
                    if (value && typeof value === 'string') {
                        if (field.endsWith('Id') || field.endsWith('Name')) {
                            arrayPath = value.replace(/\./g, '');
                        }
                    }
                }

                // PreferedArrayName Unterstützung
                const pref = options.preferedArrayName;
                if (pref) {
                    const sanitize = val => val?.replace(/\./g, '').replace(/\s/g, '');
                    if (pref.includes('+')) {
                        const [a, b] = pref.split('+');
                        const val1 = sanitize(arrayElement[a]);
                        let val2 = '';
                        if (b.includes('/')) {
                            const [x, y] = b.split('/');
                            val2 = sanitize(arrayElement[x]?.[y] ?? arrayElement[y]);
                        } else {
                            val2 = sanitize(arrayElement[b]);
                        }
                        if (val1 && val2) arrayPath = `${val1}-${val2}`;
                    } else if (pref.includes('/')) {
                        const [x, y] = pref.split('/');
                        arrayPath = sanitize(arrayElement[x]?.[y]);
                    } else if (arrayElement[pref]) {
                        arrayPath = sanitize(arrayElement[pref]);
                    }
                }

                if (options.forceIndex) {
                    arrayPath = key + index;
                }

                // Spezialfall: 2-String-Elemente als key/value
                const keys = Object.keys(arrayElement);
                if (!options.forceIndex &&
                    keys.length === 2 &&
                    typeof arrayElement[keys[0]] !== 'object' &&
                    typeof arrayElement[keys[1]] !== 'object' &&
                    arrayElement[keys[0]] !== 'null') {

                    const subKey = `${key}.${arrayElement[keys[0]]}`;
                    const subValue = arrayElement[keys[1]];
                    const subName = `${keys[0]} ${keys[1]}`;
                    const fullPath = `${path}.${subKey}`;

                    if (!this.alreadyCreatedObjects[fullPath]) {
                        await this.adapter.setObjectNotExistsAsync(fullPath, {
                            type: 'state',
                            common: {
                                name: subName,
                                role: this.getRole(subValue, options.write),
                                type: subValue !== null ? typeof subValue : 'mixed',
                                write: options.write,
                                read: true,
                            },
                            native: {},
                        });
                        this.alreadyCreatedObjects[fullPath] = true;
                    }

                    this.adapter.setState(fullPath, subValue, true);
                    continue;
                }

                await this.parse(`${path}.${arrayPath}`, arrayElement, options);
            }
        } catch (error) {
            this.adapter.log.error('Cannot extract array ' + path);
        }
    }

    getLastSegment(input) {
        if (typeof input !== 'string') return '';
        const parts = input.split('.');
        return parts[parts.length - 1];
    }

    isJsonString(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    }

    getRole(element, write) {
        if (typeof element === 'boolean' && !write) {
            return 'indicator';
        }
        if (typeof element === 'boolean' && write) {
            return 'switch';
        }
        if (typeof element === 'number' && !write) {
            return 'value';
        }
        if (typeof element === 'number' && write) {
            return 'level';
        }
        if (typeof element === 'string') {
            return 'text';
        }
        return 'state';
    }
};
