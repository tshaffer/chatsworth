"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVersion = void 0;
const version_1 = require("../version");
const getVersion = (request, response, next) => {
    const data = {
        serverVersion: version_1.version,
    };
    response.json(data);
};
exports.getVersion = getVersion;
//# sourceMappingURL=app.js.map