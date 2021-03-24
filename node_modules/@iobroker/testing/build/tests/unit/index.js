"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testAdapterWithMocks = void 0;
/**
 * @deprecated
 * Tests the adapter startup in offline mode (with mocks, no JS-Controller)
 * This is meant to be executed in a mocha context.
 */
function testAdapterWithMocks(_adapterDir, options = {}) {
    describe(`Unit tests`, () => __awaiter(this, void 0, void 0, function* () {
        // Call the user's tests
        if (typeof options.defineAdditionalTests === "function") {
            options.defineAdditionalTests();
        }
        else {
            it("DEPRECATED!", () => {
                console.warn("\u001b[33mUnit tests for adapter startup are deprecated!");
                console.warn(`If you do not define your own tests, you can remove the "test:unit" script`);
                console.warn(`from package.json and from your Travis/Github Actions workflow.\u001b[0m`);
            });
        }
    }));
}
exports.testAdapterWithMocks = testAdapterWithMocks;
