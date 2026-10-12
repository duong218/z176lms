/**
 * Quản lý kết nối Cơ sở dữ liệu MongoDB thông qua Mongoose ODM.
 */

import mongoose from 'mongoose';
import { env } from './env.js';

// Khởi tạo kết nối tới MongoDB sử dụng cấu hình MONGODB_URI
export async function connectDatabase() {
  if (!env.mongodbUri) {
    throw new Error('MONGODB_URI is not set');
  }
  mongoose.set('strictQuery', true);
  //await mongoose.connect(env.mongodbUri);
  await mongoose.connect(env.mongodbUri, {
    maxPoolSize: 200, // Tăng số kết nối tối đa lên 200
    minPoolSize: 20,  // Duy trì sẵn 20 kết nối rảnh
  });
}

// Ngắt kết nối MongoDB (dùng khi shutdown server hoặc chạy test/script)
export async function disconnectDatabase() {
  await mongoose.disconnect();
}

