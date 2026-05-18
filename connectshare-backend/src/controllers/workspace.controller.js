// ============================================================
// workspace.controller.js — Workspace Route Handlers
// ============================================================
const { validationResult } = require('express-validator');
const {
  createWorkspace,
  getUserWorkspaces,
  getWorkspaceById,
  inviteToWorkspace,
  deleteWorkspace,
} = require('../services/workspace.service');

// POST /api/v1/workspaces
const create = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, error: errors.array()[0].msg, code: 422 });
    }

    const { name, description } = req.body;
    const workspace = await createWorkspace({ name, description, userId: req.user.id });

    res.status(201).json({
      success: true,
      message: 'Workspace created',
      data: {
        ...workspace,
        workspace,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/workspaces
const list = async (req, res, next) => {
  try {
    const workspaces = await getUserWorkspaces(req.user.id);
    res.status(200).json({
      success: true,
      data: workspaces,
      workspaces,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/workspaces/:id
const getById = async (req, res, next) => {
  try {
    const workspace = await getWorkspaceById(req.params.id);
    res.status(200).json({ success: true, data: workspace });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/workspaces/:id/invite
const invite = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, error: errors.array()[0].msg, code: 422 });
    }

    const { email, role } = req.body;
    const updated = await inviteToWorkspace(req.params.id, email, role || 'MEMBER');

    res.status(200).json({
      success: true,
      message: `${email} added to workspace`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/v1/workspaces/:id
const remove = async (req, res, next) => {
  try {
    await deleteWorkspace(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/workspaces/discover
const discoverPublic = async (req, res, next) => {
  try {
    const { getPublicWorkspaces } = require('../services/workspace.service');
    const workspaces = await getPublicWorkspaces(req.user.id);
    res.status(200).json({ success: true, data: workspaces });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/workspaces/:id/request-join
const requestJoin = async (req, res, next) => {
  try {
    const { requestToJoin } = require('../services/workspace.service');
    const request = await requestToJoin(req.user.id, req.params.id);
    res.status(201).json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/workspaces/:id/requests
const listJoinRequests = async (req, res, next) => {
  try {
    const { getJoinRequests } = require('../services/workspace.service');
    const requests = await getJoinRequests(req.params.id);
    res.status(200).json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/workspaces/:id/requests/:requestId
const approveRequest = async (req, res, next) => {
  try {
    const { status } = req.body;
    const { handleJoinRequest } = require('../services/workspace.service');
    const updated = await handleJoinRequest(req.params.requestId, status);
    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

module.exports = { 
  create, 
  list, 
  getById, 
  invite, 
  remove, 
  discoverPublic, 
  requestJoin, 
  listJoinRequests, 
  approveRequest 
};
