// routes/users.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user');
const Task = require('../models/task');

// ---------- helpers ----------
function parseJSON(q, def = {}) {
  if (q == null) return def;
  try {
    // allow booleans/numbers without quotes where appropriate
    return JSON.parse(q);
  } catch {
    return def;
  }
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

function ok(res, data, status = 200) {
  return res.status(status).json({ message: 'OK', data });
}
function err(res, status, message, data = {}) {
  return res.status(status).json({ message, data });
}

// keep email unique by index as well
if (!User.schema.paths.email.options.unique) {
  User.schema.path('email').index({ unique: true });
}

// ---------- GET / (list or count) ----------
router.get('/', async (req, res) => {
  try {
    const { where, sort, select, skip, limit, count } = buildFindOptions(req.query);
    const q = User.find(where);
    if (sort) q.sort(sort);
    if (select) q.select(select);
    if (skip != null) q.skip(skip);
    if (limit != null) q.limit(limit);

    if (count) {
      const c = await User.countDocuments(where);
      return ok(res, c);
    }
    const users = await q.lean();
    return ok(res, users);
  } catch (e) {
    return err(res, 500, 'Server error while querying users');
  }
});

// ---------- POST / (create) ----------
router.post('/', async (req, res) => {
  try {
    const { name, email, pendingTasks = [] } = req.body || {};
    if (!name || !email) return err(res, 400, 'User requires name and email');

    // email uniqueness check
    const dup = await User.findOne({ email });
    if (dup) return err(res, 400, 'A user with this email already exists');

    const user = new User({ name, email, pendingTasks });
    await user.save();

    // synchronize tasks assignedUser if pendingTasks provided
    if (Array.isArray(pendingTasks) && pendingTasks.length) {
      await Task.updateMany(
        { _id: { $in: pendingTasks.map(String) } },
        { $set: { assignedUser: String(user._id), assignedUserName: user.name } }
      );
    }

    return ok(res, user, 201);
  } catch (e) {
    return err(res, 500, 'Server error while creating user');
  }
});

// ---------- GET /:id ----------
router.get('/:id', async (req, res) => {
  try {
    const u = await User.findById(req.params.id).lean();
    if (!u) return err(res, 404, 'User not found');
    return ok(res, u);
  } catch {
    return err(res, 404, 'User not found');
  }
});

// ---------- PUT /:id (replace entire user) ----------
router.put('/:id', async (req, res) => {
  try {
    const { name, email, pendingTasks = [] } = req.body || {};
    if (!name || !email) return err(res, 400, 'User requires name and email');

    const user = await User.findById(req.params.id);
    if (!user) return err(res, 404, 'User not found');

    // uniqueness for email (excluding self)
    const dup = await User.findOne({ email, _id: { $ne: user._id } });
    if (dup) return err(res, 400, 'A user with this email already exists');

    // old tasks currently assigned to this user
    const oldTaskIds = new Set((user.pendingTasks || []).map(String));
    const newTaskIds = new Set((pendingTasks || []).map(String));

    // tasks to unassign
    const toUnassign = [...oldTaskIds].filter(id => !newTaskIds.has(id));
    // tasks to assign
    const toAssign = [...newTaskIds].filter(id => !oldTaskIds.has(id));

    // update user doc
    user.name = name;
    user.email = email;
    user.pendingTasks = [...newTaskIds];
    await user.save();

    // sync tasks (unassign removed)
    if (toUnassign.length) {
      await Task.updateMany(
        { _id: { $in: toUnassign }, assignedUser: String(user._id) },
        { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
      );
    }
    // assign new tasks
    if (toAssign.length) {
      await Task.updateMany(
        { _id: { $in: toAssign } },
        { $set: { assignedUser: String(user._id), assignedUserName: user.name } }
      );
    }

    return ok(res, await User.findById(user._id).lean());
  } catch (e) {
    return err(res, 500, 'Server error while updating user');
  }
});

// ---------- DELETE /:id ----------
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return err(res, 404, 'User not found');

    // unassign all tasks of this user
    await Task.updateMany(
      { assignedUser: String(user._id) },
      { $set: { assignedUser: '', assignedUserName: 'unassigned' } }
    );

    await user.deleteOne();
    // 204 with standard wrapper:
    return res.status(204).json({ message: 'OK', data: {} });
  } catch {
    return err(res, 500, 'Server error while deleting user');
  }
});

module.exports = router;