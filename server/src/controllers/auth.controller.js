'use strict';
const authService = require('../services/auth.service');

async function register(req, res, next) {
  try {
    const { user, status } = await authService.register(req.body);
    const message =
      status === 'ACTIVE'
        ? 'Registration successful. You can now sign in.'
        : 'Registration submitted. An administrator must activate your account before you can sign in.';
    res.status(201).json({ user, message });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    res.status(200).json(await authService.login(req.body));
  } catch (err) {
    next(err);
  }
}

function me(req, res) {
  res.json({ user: req.user.publicUser });
}

module.exports = { register, login, me };
