"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const routes_1 = require("./routes");
const bodyParser = require('body-parser');
const path_1 = __importDefault(require("path"));
console.log('This is a placeholder for the server code.');
dotenv_1.default.config();
const startServer = async () => {
    await (0, config_1.connectDB)(); // ✅ Ensure DB is connected before anything else
    // Initialize Express app
    const app = (0, express_1.default)();
    const PORT = process.env.PORT || 8080;
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    // add routes
    (0, routes_1.createRoutes)(app);
    // === Environment Configuration Endpoint ===
    app.get('/env-config.json', (req, res) => {
        res.json({
            BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:8080',
        });
    });
    // Serve static files from the /public directory
    app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
    // Serve the SPA on the root route (index.html)
    app.get('/', (req, res) => {
        res.sendFile(path_1.default.join(__dirname, '../public', 'index.html'));
    });
    // Start the server
    const server = app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
    process.on('unhandledRejection', (err, promise) => {
        console.log(`Error: ${err.message}`);
        // Close server and exit process
        server.close(() => process.exit(1));
    });
};
startServer();
//# sourceMappingURL=server.js.map