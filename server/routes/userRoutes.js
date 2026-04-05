// routes/userRoutes.js — Định tuyến API người dùng

const express        = require('express');
const router         = express.Router();
const userController = require('../controllers/userController');
const { auth, isAdmin } = require('../middleware/auth');

// Công khai
router.post('/register', userController.register);
router.post('/login',    userController.login);
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password',  userController.resetPassword);

// Cần đăng nhập
router.get ('/profile',          auth, userController.getProfile);
router.put ('/profile',          auth, userController.updateProfile);
router.put ('/change-password',  auth, userController.changePassword);

router.get ('/admin/all',        auth, isAdmin, userController.getAllUsers);
router.put ('/admin/:id/update', auth, isAdmin, userController.updateUserAdmin);
router.put ('/admin/:id/role',   auth, isAdmin, userController.updateRole);
router.delete('/:id',            auth, isAdmin, userController.deleteUser);

module.exports = router;
