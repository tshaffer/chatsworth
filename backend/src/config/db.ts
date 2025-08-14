import mongoose from 'mongoose';

export async function connectDB(): Promise<void> {
  const MONGO_URI =
    process.env.MONGO_URI || 'mongodb://localhost:27017/chatsworth';

  try {
    await mongoose.connect(MONGO_URI);
    console.log(`✅ Connected to MongoDB at ${MONGO_URI}`);
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error);
    process.exit(1); // fail fast in prod
  }
}
