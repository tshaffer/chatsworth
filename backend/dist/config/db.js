"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connection = exports.connectDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatsworth';
let connection;
const connectDB = async () => {
    console.log('mongo uri is:');
    console.log(process.env.MONGO_URI);
    if (!connection) {
        const conn = await mongoose_1.default.createConnection(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            useFindAndModify: false,
        });
        console.log('MongoDB Connected');
        mongoose_1.default.Promise = global.Promise;
        exports.connection = connection = conn;
    }
    return connection;
};
exports.connectDB = connectDB;
//# sourceMappingURL=db.js.map