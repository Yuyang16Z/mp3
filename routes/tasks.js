// routes/tasks.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Task = require('../models/task');
const User = require('../models/user');

// ---------- helpers ----------
function parseJSON(q, def = {}) {
  if (q == null) return def;
  try { return JSON.parse(q); } catch { return def; }
}
function buildFindOptions(query) {
  const where = parseJSON(query.where, {});
  const sort = parseJSON(query.sort, undefined);
  const select = parseJSON(query.select, undefined);
  const skip = query.skip ? Number(query.skip) : undefined;
  const limit = query.limit ? Number(query.limit) : undefined;
  const count = String(query.count).toLowerCase() === 'true';
  return { where, sort, select, skip, limit, count };
}
function ok(res, data, status = 200) { return res.status(status).json({ message: 'OK', data }); }
function err(res, status, message, data = {}) { return res.status(status).json({ message, data }); }

// ---------- GET / ----------
router.get('/', async (req, res) => {
  try {
    const { where, sort, select, skip, limit, count } = buildFindOptions(req.query);
    const q = Task.find(where);
    if (sort) q.sort(sort);
    if (select) q.select(select);
    if (skip != null) q.skip(skip);
    if (limit != null) q.limit(limit);

    if (count) {
      const c = await Task.countDocuments(where);
      return ok(res, c);
    }
    const tasks = await q.lean();
    return ok(res, tasks);
  } catch {
    return err(res, 500, 'Server error while querying tasks');
  }
});

// ---------- POST / (create) ----------
router.post('/', async (req, res) => {
  try {
    const {
      name, description = '',
      deadline, completed = false,
      assignedUser = '', assignedUserName = 'unassigned'
    } = req.body || {};

    if (!name || !deadline) return err(res, 400, 'Task requires name and deadline');

    const task = new Task({
      name, description, deadline, completed,
      assignedUser: assignedUser || '',
      assignedUserName: assignedUser ? assignedUserName : 'unassigned'
    });
    await task.save();

    // if assignedUser is set, validate and sync user.pendingTasks
    if (assignedUser) {
      const user = await User.findById(assignedUser);
      if (!user) {
        // rollback assignment details to keep DB consistent
        await Task.findByIdAndUpdate(task._id, { assignedUser: '', assignedUserName: 'unassigned' });
      } else {
        // keep assignedUserName truthful
        if (task.assignedUserName === 'unassigned') {
          task.assignedUserName = user.name;
          await task.save();
        }
        // add to pendingTasks if not completed
        if (!task.completed) {
          const idStr = String(task._id);
          if (!user.pendingTasks.map(String).includes(idStr)) {
            user.pendingTasks.push(idStr);
            await user.save();
          }
        }
      }
    }

    return ok(res, await Task.findById(task._id).lean(), 201);
  } catch {
    return err(res, 500, 'Server error while creating task');
  }
});

// ---------- GET /:id ----------
router.get('/:id', async (req, res) => {
  try {
    const t = await Task.findById(req.params.id).lean();
    if (!t) return err(res, 404, 'Task not found');
    return ok(res, t);
  } catch {
    return err(res, 404, 'Task not found');
  }
});

// ---------- PUT /:id (replace entire task) ----------
router.put('/:id', async (req, res) => {
  try {
    const {
      name, description = '',
      deadline, completed = false,
      assignedUser = '', assignedUserName
    } = req.body || {};

    if (!name || !deadline) return err(res, 400, 'Task requires name and deadline');

    const task = await Task.findById(req.params.id);
    if (!task) return err(res, 404, 'Task not found');

    const oldAssignedUser = task.assignedUser ? String(task.assignedUser) : '';
    const oldCompleted = !!task.completed;

    // apply new values
    task.name = name;
    task.description = description ?? '';
    task.deadline = deadline;
    task.completed = !!completed;

    // normalize assignment
    const newAssignedUser = assignedUser ? String(assignedUser) : '';
    task.assignedUser = newAssignedUser;
    if (newAssignedUser) {
      // prefer provided assignedUserName else pull from user
      if (assignedUserName) task.assignedUserName = assignedUserName;
      else {
        const u = await User.findById(newAssignedUser);
        task.assignedUserName = u ? u.name : 'unassigned';
      }
    } else {
      task.assignedUserName = 'unassigned';
    }

    await task.save();

    // synchronize user.pendingTasks
    // 1) if assignment changed, remove from old user
    if (oldAssignedUser && oldAssignedUser !== newAssignedUser) {
      await User.updateOne(
        { _id: oldAssignedUser },
        { $pull: { pendingTasks: String(task._id) } }
      );
    }
    // 2) add to new user if exists & not completed
    if (newAssignedUser) {
      const user = await User.findById(newAssignedUser);
      if (user) {
        const idStr = String(task._id);
        if (!task.completed) {
          if (!user.pendingTasks.map(String).includes(idStr)) {
            user.pendingTasks.push(idStr);
          }
        } else {
          user.pendingTasks = user.pendingTasks.filter(tid => String(tid) !== idStr);
        }
        await user.save();
      } else {
        // invalid user id -> unassign task
        task.assignedUser = '';
        task.assignedUserName = 'unassigned';
        await task.save();
      }
    }

    // 3) if completed state toggled true, ensure removal from whichever user holds it
    if (!newAssignedUser || task.completed) {
      await User.updateMany(
        { pendingTasks: String(task._id) },
        { $pull: { pendingTasks: String(task._id) } }
      );
    }

    return ok(res, await Task.findById(task._id).lean());
  } catch (e) {
    return err(res, 500, 'Server error while updating task');
  }
});

// ---------- DELETE /:id ----------
router.delete('/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return err(res, 404, 'Task not found');

    // remove from assigned user's pendingTasks if present
    if (task.assignedUser) {
      await User.updateOne(
        { _id: String(task.assignedUser) },
        { $pull: { pendingTasks: String(task._id) } }
      );
    }

    await task.deleteOne();
    return res.status(204).json({ message: 'OK', data: {} });
  } catch {
    return err(res, 500, 'Server error while deleting task');
  }
});

module.exports = router;