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
    /**
     * Creates a new Json2iob instance.
     *
     * @param {object} adapter The ioBroker adapter instance
     */
    constructor(adapter) {
        this.adapter = adapter;
        this.alreadyCreatedObjects = {};
        this.MAX_DEPTH = 10; // maximale Rekursionstiefe
    }

    /**
     * Parses a JSON element and creates corresponding ioBroker states/channels.
     *
     * @param {string} path The ioBroker object path (dot-separated)
     * @param {any} element The value or object to parse
     * @param {object} [options] Parsing options
     * @param {number} [_depth] Interne Rekursionstiefe (nicht von außen setzen)
     * @param {Set} [_seen] Interne Referenz-Menge zum Schutz vor Zirkulärreferenzen (nicht von außen setzen)
     * @returns {Promise<void>}
     */
    async parse(path, element, options = { write: false }, _depth = 0, _seen = new Set()) {
        // Options nicht mutieren – lokale Kopie erstellen
        options = Object.assign({}, options);

        // Tiefenbegrenzung – verhindert Stack Overflow bei tief verschachtelten Strukturen
        if (_depth > this.MAX_DEPTH) {
            this.adapter.log.warn(`json2iob: maximale Tiefe (${this.MAX_DEPTH}) erreicht bei Pfad: ${path}`);
            return;
        }

        if (element == null) {
            this.adapter.log.debug(`Cannot extract empty: ${  path}`);
            return;
        }

        // Zirkulärreferenz-Schutz für Objekte
        if (typeof element === 'object') {
            if (_seen.has(element)) {
                this.adapter.log.warn(`json2iob: zirkuläre Referenz erkannt bei Pfad: ${path} – wird übersprungen`);
                return;
            }
            _seen.add(element);
        }

        if (typeof element === 'string' || typeof element === 'number' || typeof element === 'boolean') {
            // Name = letzter Pfad-Segment, nicht der Wert selbst
            const name = this.getLastSegment(path);
            if (!this.alreadyCreatedObjects[path]) {
                try {
                    await this.adapter.setObjectNotExistsAsync(path, {
                        type: 'state',
                        common: {
                            name,
                            role: this.getRole(element, options.write),
                            type: typeof element,
                            write: options.write || false,
                            read: true,
                        },
                        native: {},
                    });
                    this.alreadyCreatedObjects[path] = true;
                } catch (error) {
                    this.adapter.log.error(error);
                }
            }
            try {
                await this.adapter.setStateAsync(path, element, true);
            } catch (err) {
                this.adapter.log.warn(`setState failed for ${path}: ${JSON.stringify(err)}`);
            }
            return;
        }

        const channelName = options.channelName || this.getLastSegment(path);

        if (!this.alreadyCreatedObjects[path]) {
            try {
                await this.adapter.setObjectNotExistsAsync(path, {
                    type: 'channel',
                    common: {
                        name: channelName,
                        write: false,
                        read: true,
                    },
                    native: {},
                });
                this.alreadyCreatedObjects[path] = true;
            } catch (error) {
                this.adapter.log.error(error);
            }
        }

        if (Array.isArray(element)) {
            await this.extractArray(element, '', path, options, _depth + 1, _seen);
            return;
        }

        for (const key of Object.keys(element)) {
            const fullPath = `${path}.${key}`;
            const value = element[key];

            if (Array.isArray(value)) {
                try {
                    await this.extractArray(element, key, path, options, _depth + 1, _seen);
                } catch (error) {
                    this.adapter.log.error(`extractArray ${  error}`);
                }
                continue;
            }

            const isObj = this.isObject(value);
            const skipKey = this.adapter.config.motor === 'EV' && (key === 'start' || key === 'end');

            if (skipKey) {
                continue;
            }

            if (isObj) {
                await this.parse(fullPath, value, options, _depth + 1, _seen);
                continue;
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
                if (value !== undefined) {
                    await this.adapter.setStateAsync(fullPath, value, true);
                }
            } catch (err) {
                this.adapter.log.warn(`ERROR ${value} ${JSON.stringify(err)}`);
            }
        }
    }

    /**
     * Tests whether a value is a non-null object.
     *
     * @param {any} value The value to test
     * @returns {boolean}
     */
    isObject(value) {
        return value !== null && typeof value === 'object';
    }

    /**
     * Extracts and parses an array element into ioBroker states.
     *
     * @param {object|Array} element The parent object or array containing the array
     * @param {string} key The key of the array within the element (empty string if element is already the array)
     * @param {string} path The current ioBroker object path
     * @param {object} options Parsing options
     * @param {number} [_depth] Interne Rekursionstiefe
     * @param {Set} [_seen] Interne Referenz-Menge zum Schutz vor Zirkulärreferenzen
     * @returns {Promise<void>}
     */
    async extractArray(element, key, path, options, _depth = 0, _seen = new Set()) {
        try {
            const array = key ? element[key] : element;

            for (let i = 0; i < array.length; i++) {
                const arrayElement = array[i];
                const index = (i + 1).toString().padStart(2, '0');
                let arrayPath = key + index;

                if (typeof arrayElement === 'string') {
                    await this.parse(`${path}.${key}.${arrayElement}`, arrayElement, options, _depth + 1, _seen);
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

                // Id-/Name-Felder priorisieren (nur wenn noch kein Feld aus pathCandidates getroffen hat)
                if (arrayPath === key + index) {
                    for (const [field, value] of Object.entries(arrayElement)) {
                        if (value && typeof value === 'string') {
                            if (field.endsWith('Id') || field.endsWith('Name')) {
                                arrayPath = value.replace(/\./g, '');
                                break;
                            }
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
                        if (val1 && val2) {
                            arrayPath = `${val1}-${val2}`;
                        }
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

                    await this.adapter.setStateAsync(fullPath, subValue, true);
                    continue;
                }

                await this.parse(`${path}.${arrayPath}`, arrayElement, options, _depth + 1, _seen);
            }
        } catch (error) {
            this.adapter.log.error(`Cannot extract array ${  path}`);
        }
    }

    /**
     * Returns the last dot-separated segment of a path string.
     *
     * @param {string} input The dot-separated path string
     * @returns {string} The last segment, or an empty string if input is not a string
     */
    getLastSegment(input) {
        if (typeof input !== 'string') {
            return '';
        }
        const parts = input.split('.');
        return parts[parts.length - 1];
    }


    /**
     * Determines the ioBroker role for a given value.
     *
     * @param {any} element The value to determine the role for
     * @param {boolean} write Whether the state should be writable
     * @returns {string} The ioBroker role string
     */
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
