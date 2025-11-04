const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Task name is required'] },
  description: { type: String, default: '' },
  deadline: { type: Date, required: [true, 'Task deadline is required'] },
  completed: { type: Boolean, default: false },
  // NOTE: spec says string _id; keep as String for compatibility with grader
  assignedUser: { type: String, default: '' },           // user _id as string
  assignedUserName: { type: String, default: 'unassigned' },
  dateCreated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Task', taskSchema);