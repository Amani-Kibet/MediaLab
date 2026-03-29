import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  googleId: { type: String, unique: true, sparse: true },
  appleId: { type: String, unique: true, sparse: true },
  name: { type: String },
  email: { type: String, unique: true, sparse: true },
  profilePicture: { type: String },
  provider: { type: String, enum: ["google", "apple", "local"] },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now },
});

const User = mongoose.model("User", UserSchema);
export default User;
