import mongoose from "mongoose";

const MarketplaceCommentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, default: "", trim: true },
    text: { type: String, required: true, trim: true },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    date: { type: Date, default: Date.now },
  },
  { _id: true },
);

const MarketplacePurchaseSchema = new mongoose.Schema(
  {
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    buyerName: { type: String, default: "", trim: true },
    buyerEmail: { type: String, default: "", trim: true, lowercase: true },
    status: {
      type: String,
      enum: ["pending", "approved", "failed"],
      default: "pending",
    },
    createdAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
  },
  { _id: true },
);

const MarketplaceItemSchema = new mongoose.Schema({
  projectId: { type: String, required: true, trim: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  price: { type: Number, default: 0, min: 0 },
  category: { type: String, default: "General", trim: true },
  screenshots: { type: [String], default: [] },
  purpose: { type: String, default: "", trim: true },
  status: {
    type: String,
    enum: ["pending", "approved", "sold"],
    default: "pending",
  },
  authorName: { type: String, default: "", trim: true },
  authorAvatar: { type: String, default: "", trim: true },
  liveUrl: { type: String, default: "", trim: true },
  comments: { type: [MarketplaceCommentSchema], default: [] },
  purchases: { type: [MarketplacePurchaseSchema], default: [] },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model("MarketplaceItem", MarketplaceItemSchema);
