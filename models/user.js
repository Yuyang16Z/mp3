// models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'User name is required'] },
  email: { type: String, required: [true, 'Email is required'], unique: true },
  pendingTasks: [{ type: String }], // array of task _id as string
  dateCreated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);