"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRoutes = void 0;
const controllers_1 = require("../controllers");
const createRoutes = (app) => {
    app.get('/api/v1/version', controllers_1.getVersion);
};
exports.createRoutes = createRoutes;
//# sourceMappingURL=routes.js.map