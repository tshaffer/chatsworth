import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chatsworth';

let connection: mongoose.Connection;

const connectDB = async () => {
  console.log('mongo uri is:');
  console.log(process.env.MONGO_URI);
  if (!connection) {
    const conn = await mongoose.createConnection(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
    });

    console.log('MongoDB Connected');

    mongoose.Promise = global.Promise;

    connection = conn;
  }

  return connection;
};

export { connectDB, connection };
