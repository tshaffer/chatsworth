import mongoose from 'mongoose';
import { ProjectModel } from '../models/Project';

async function syncIndexes() {
  await mongoose.connect(process.env.MONGO_URI!);
  await ProjectModel.syncIndexes();
  console.log('Indexes synced');
  await mongoose.disconnect();
}

syncIndexes().catch(console.error);

