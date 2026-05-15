import axios from 'axios';
import { io } from 'socket.io-client';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

// ── Cấu hình ──────────────────────────────────────────────────
const API_URL = 'http://localhost:5000/api';
const socket  = io('http://localhost:5000');

let currentUser = JSON.parse(localStorage.getItem('user')) || null;
let token       = localStorage.getItem('token') || null;
let allProducts = [];
let currentCartItems = []; // Lưu giỏ hàng để dùng khi checkout

// ═══════════════════════════════════════════════════════════════
//  TOAST NOTIFICATION
// ═══════════════════════════════════════════════════════════════
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    Object.assign(container.style, {
      position: 'fixed', top: '1.5rem', right: '1.5rem',
      zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.6rem',
    });
    document.body.appendChild(container);
  }

  const config = {
    success: { bg:'#2d5a27', icon:'✓' },
    error:   { bg:'#c0392b', icon:'✕' },
    info:    { bg:'#2471a3', icon:'ℹ' },
    warning: { bg:'#d4840a', icon:'!' },
  };
  const { bg, icon } = config[type] ?? config.info;

  const toast = document.createElement('div');
  Object.assign(toast.style, {
    background: bg, color: 'white', padding: '0.85rem 1.4rem', borderRadius: '14px',
    fontFamily: "'Outfit', sans-serif", fontSize: '0.92rem', fontWeight: '600',
    display: 'flex', alignItems: 'center', gap: '0.7rem',
    boxShadow: '0 8px 25px rgba(0,0,0,0.22)', minWidth: '240px', maxWidth: '360px',
    animation: 'toastIn 0.3s ease forwards', cursor: 'pointer',
  });

  toast.innerHTML = `<span style="background:rgba(255,255,255,0.2);borderRadius:50%;width:24px;height:24px;display:flex;alignItems:center;justifyContent:center;fontSize:0.8rem">${icon}</span> ${message}`;
  container.appendChild(toast);

  const close = () => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  };
  const timer = setTimeout(close, 3500);
  toast.addEventListener('click', () => { clearTimeout(timer); close(); });
}

// ═══════════════════════════════════════════════════════════════
//  ĐIỀU HƯỚNG SPA (HISTORY ROUTER)
// ═══════════════════════════════════════════════════════════════
const pages = ['page-home', 'page-cart', 'page-orders', 'page-admin', 'page-profile', 'page-password', 'page-chat'];
function showPage(pageId) {
  pages.forEach(p => {
    const el = document.getElementById(p);
    if (el) el.style.display = p === pageId ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const navMap = { 'page-home': 'nav-home', 'page-cart': 'nav-cart', 'page-orders': 'btn-my-orders', 'page-admin': 'nav-admin', 'page-chat': 'nav-chat', 'page-reset-password': 'none' };
  const activeNav = document.getElementById(navMap[pageId]);
  if (activeNav) activeNav.classList.add('active');
  
  // Khóa cuộn trang khi ở khung Chat
  if (pageId === 'page-chat' || pageId === 'page-reset-password') {
     document.body.style.overflow = 'hidden';
     window.scrollTo({ top: 0, behavior: 'instant' });
  } else {
     document.body.style.overflow = '';
     window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function navigateTo(path) {
  if (window.location.pathname !== path) {
    history.pushState(null, '', path);
  }
  handleRoute();
}

function handleRoute() {
  const path = window.location.pathname;
  if (path.startsWith('/cart')) {
    if (!currentUser) { showToast('Đăng nhập để vào giỏ hàng!', 'info'); openModal('modal-login'); navigateTo('/'); return; }
    if (currentUser.role === 'admin') { navigateTo('/'); return; }
    showPage('page-cart'); loadCart();
  } else if (path.startsWith('/orders')) {
    if (!currentUser) { showToast('Đăng nhập!', 'info'); openModal('modal-login'); navigateTo('/'); return; }
    if (currentUser.role === 'admin') { navigateTo('/'); return; }
    showPage('page-orders'); loadMyOrders();
  } else if (path.startsWith('/admin')) {
    if (!currentUser || currentUser.role !== 'admin') { navigateTo('/'); return; }
    showPage('page-admin'); 
    loadAdminTab(document.querySelector('.admin-tab-btn.active')?.dataset.tab || 'stats');
  } else if (path.startsWith('/profile')) {
    if (!currentUser) { navigateTo('/'); return; }
    showPage('page-profile'); loadProfile();
  } else if (path.startsWith('/password')) {
    if (!currentUser) { navigateTo('/'); return; }
    showPage('page-password'); loadChangePassword();
  } else if (path.startsWith('/chat')) {
    if (!currentUser) { showToast('Đăng nhập để vào trò chuyện!', 'info'); openModal('modal-login'); navigateTo('/'); return; }
    showPage('page-chat'); loadChatPage();
  } else if (path.startsWith('/success')) {
    showToast('Thanh toán thành công! Cảm ơn bạn đã mua hàng.', 'success');
    navigateTo('/orders');
  } else if (path.startsWith('/cancel')) {
    showToast('Thanh toán đã bị hủy.', 'warning');
    navigateTo('/cart');
  } else if (path.startsWith('/reset-password')) {
    showPage('page-reset-password');
  } else {
    showPage('page-home');
  }
}

window.fetchAndRenderMessages = async (otherId) => {
    const chatContent = document.getElementById('chat-messages-content');
    chatContent.innerHTML = '<div style="text-align:center; padding: 2rem; color:#999;">Đang tải tin nhắn...</div>';
    try {
        const res = await axios.get(`${API_URL}/messages/${otherId}`, { headers: { Authorization: `Bearer ${token}` } });
        chatContent.innerHTML = '';
        if (res.data.length === 0) {
            chatContent.innerHTML = '<div style="text-align:center; padding: 2rem; color:#999;">Bắt đầu cuộc trò chuyện với MiniGarden!</div>';
            return;
        }
        chatContent.innerHTML = res.data.map(msg => {
            const isMe = msg.sender_id === currentUser.user_id;
            return `<div class="chat-bubble ${isMe ? 'me' : 'bot'}" style="align-self:${isMe ? 'flex-end' : 'flex-start'}; background:${isMe ? 'var(--primary)' : 'white'}; color:${isMe ? 'white' : 'var(--text)'}; padding:0.8rem 1rem; border-radius:14px; max-width:70%; font-size:0.95rem; border:1px solid ${isMe ? 'transparent' : 'var(--border)'}">${processMessageText(msg.message_text)}</div>`;
        }).join('');
        chatContent.scrollTop = chatContent.scrollHeight;

        // Mark read
        const readerId = currentUser.user_id;
        socket.emit('mark_read', { sender_id: otherId, reader_id: readerId });
    } catch(err) {
        chatContent.innerHTML = '<div style="text-align:center; padding: 2rem; color:#999;">Không thể tải lịch sử nhắn tin.</div>';
    }
};

window.loadChatPage = () => {
  const badge = document.getElementById('chat-badge');
  if (badge) badge.style.display = 'none';

  // Nếu đính kèm sản phẩm, hiện preview
  if (window.pendingChatProductId && allProducts) {
      const prod = allProducts.find(p => p.product_id === window.pendingChatProductId);
      if (prod) {
          document.getElementById('chat-product-preview').style.display = 'flex';
          document.getElementById('chat-preview-img').src = prod.image_url;
          document.getElementById('chat-preview-name').textContent = prod.product_name;
      }
  } else {
      document.getElementById('chat-product-preview').style.display = 'none';
  }

  if (currentUser?.role === 'admin') {
      setupAdminChat();
  } else {
      const sidebar = document.getElementById('admin-chat-sidebar');
      if (sidebar) sidebar.style.display = 'none';
      window.currentChatUserId = 1; // Mặc định chat với Admin (ID=1)
      fetchAndRenderMessages(1);
  }
};

window.addEventListener('popstate', handleRoute);

function goHome() {
  navigateTo('/');
}

document.getElementById('logo-home').onclick = goHome;
document.getElementById('nav-home').onclick = goHome;
document.getElementById('shop-now').onclick = () => { goHome(); setTimeout(() => document.getElementById('product-list')?.scrollIntoView({ behavior:'smooth' }), 100); };
document.getElementById('nav-chat').onclick = () => { navigateTo('/chat'); };
document.getElementById('nav-shop').onclick = () => { goHome(); setTimeout(() => document.getElementById('product-list')?.scrollIntoView({ behavior:'smooth' }), 100); };
document.getElementById('nav-cart').onclick = () => { navigateTo('/cart'); };
document.getElementById('nav-admin').onclick = () => { navigateTo('/admin'); };
document.getElementById('btn-change-password').onclick = () => { navigateTo('/password'); };

// ═══════════════════════════════════════════════════════════════
//  MODALS & UI HELPERS
// ═══════════════════════════════════════════════════════════════
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

document.getElementById('btn-open-login').onclick = () => openModal('modal-login');
document.getElementById('btn-open-register').onclick = () => openModal('modal-register');
document.getElementById('close-login').onclick = () => closeModal('modal-login');
document.getElementById('close-register').onclick = () => closeModal('modal-register');
document.getElementById('close-checkout').onclick = () => closeModal('modal-checkout');
document.getElementById('close-product-modal').onclick = () => closeModal('modal-product');

document.getElementById('switch-to-register').onclick = () => { closeModal('modal-login'); openModal('modal-register'); };
document.getElementById('switch-to-login').onclick = () => { closeModal('modal-register'); openModal('modal-login'); };
document.getElementById('open-forgot').onclick = () => { closeModal('modal-login'); openModal('modal-forgot'); };
document.getElementById('close-forgot').onclick = () => closeModal('modal-forgot');

document.getElementById('form-forgot').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value;
    const btn = document.getElementById('btn-do-forgot');
    btn.disabled = true; btn.textContent = 'Đang gửi...';
    try {
        const res = await axios.post(`${API_URL}/users/forgot-password`, { email });
        showToast(res.data.message, 'success');
        closeModal('modal-forgot');
    } catch(err) {
        showToast(err.response?.data?.message || 'Lỗi gửi mail!', 'error');
    } finally { btn.disabled = false; btn.textContent = 'Gửi yêu cầu'; }
};

document.getElementById('form-reset').onsubmit = async (e) => {
    e.preventDefault();
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1]);
    const tokenStr = urlParams.get('token');
    const new_password = document.getElementById('reset-new-password').value;
    
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})/.test(new_password)) {
        showToast('Mật khẩu mới chưa đủ mạnh (≥8 ký tự, gồm số, chữ hoa, chữ thường)', 'warning');
        return;
    }

    const btn = document.getElementById('btn-do-reset');
    btn.disabled = true; btn.textContent = 'Đang xử lý...';
    try {
        const res = await axios.post(`${API_URL}/users/reset-password`, { token: tokenStr, new_password });
        showToast(res.data.message, 'success');
        navigateTo('/');
        openModal('modal-login');
    } catch(err) {
        showToast(err.response?.data?.message || 'Lỗi khôi phục mật khẩu!', 'error');
    } finally { btn.disabled = false; btn.textContent = 'Cập nhật mật khẩu'; }
};

window.openChatWithProduct = (id) => {
    window.pendingChatProductId = id;
    navigateTo('/chat');
};

// (Duplicate chat functions removed)

document.getElementById('remove-product-preview').onclick = () => {
    window.pendingChatProductId = null;
    document.getElementById('chat-product-preview').style.display = 'none';
};

function processMessageText(msgText) {
    if (msgText && msgText.startsWith('||PRODUCT_ID:')) {
        const endIdx = msgText.indexOf('||', 13);
        if (endIdx > -1) {
            const idPart = msgText.substring(13, endIdx); 
            const prodId = parseInt(idPart);
            const actualMsg = msgText.substring(endIdx + 2);
            
            const prod = allProducts ? allProducts.find(p => p.product_id === prodId) : null;
            if (prod) {
                return `
                   <div style="background:#f9f9f9; padding:0.5rem; border-radius:8px; display:flex; gap:0.5rem; border:1px solid #ddd; margin-bottom:0.5rem; cursor:pointer;" onclick="window.location.href='/#product-${prodId}'; goHome(); setTimeout(() => document.getElementById('product-list')?.scrollIntoView(), 200);">
                      <img src="${prod.image_url}" width="40" height="40" style="border-radius:4px; object-fit:cover;">
                      <div style="font-size:0.8rem;">
                         <div style="font-weight:700; color:#333;">${prod.product_name}</div>
                         <div style="color:var(--primary);">${Number(prod.price).toLocaleString()}đ</div>
                      </div>
                   </div>
                   ${actualMsg}
                `;
            }
            return actualMsg;
        }
    }
    return msgText || '';
}

// Khởi tạo kênh Chat realtime
if (currentUser) {
    socket.emit('join_room', currentUser.user_id);
}

document.getElementById('btn-send-msg').onclick = () => {
    const input = document.getElementById('msg-input');
    let msg = input.value.trim();
    if (!msg && !window.pendingChatProductId) return;
    if (!msg) msg = "Tôi muốn tư vấn sản phẩm này."; // Mặc định nếu chỉ có SP

    if (window.pendingChatProductId) {
        msg = `||PRODUCT_ID:${window.pendingChatProductId}||` + msg;
    }

    if (!currentUser) {
        showToast('Vui lòng đăng nhập để gửi tin nhắn!', 'warning');
        openModal('modal-login');
        return;
    }

    const receiverId = currentUser.role === 'admin' ? (window.currentChatUserId || 1) : 1;

    socket.emit('send_message', {
        sender_id: currentUser.user_id,
        receiver_id: receiverId,
        message_text: msg
    });

    const chatContent = document.getElementById('chat-messages-content');
    chatContent.innerHTML += `<div class="chat-bubble me" style="align-self:flex-end; background:var(--primary); color:white; padding:0.8rem 1rem; border-radius:14px; max-width:70%; font-size:0.95rem;">${processMessageText(msg)}</div>`;
    chatContent.scrollTop = chatContent.scrollHeight;
    
    input.value = '';
    window.pendingChatProductId = null;
    document.getElementById('chat-product-preview').style.display = 'none';

    if (currentUser.role === 'admin') {
        setupAdminChat();
    }
};

document.getElementById('msg-input').onkeypress = (e) => {
    if (e.key === 'Enter') document.getElementById('btn-send-msg').click();
};

socket.on('receive_message', (data) => {
    if (!currentUser || data.sender_id === currentUser.user_id) return; 

    // Nếu đang ở trang chat và admin đang hỗ trợ khách hàng này thì render luôn
    if (document.getElementById('page-chat').style.display !== 'none') {
        if (currentUser.role === 'admin') {
            setupAdminChat(); // Cập nhật sidebar (vị trí/unread)
        }
        if (window.currentChatUserId === data.sender_id) {
            const chatContent = document.getElementById('chat-messages-content');
            chatContent.innerHTML += `<div class="chat-bubble bot" style="align-self:flex-start; background:white; color:var(--text); border:1px solid var(--border)">${processMessageText(data.message_text)}</div>`;
            chatContent.scrollTop = chatContent.scrollHeight;
        }
    } else {
        const badge = document.getElementById('chat-badge');
        if (badge) badge.style.display = 'inline-flex';
        showToast('Bạn có tin nhắn mới!', 'info');
    }
});

function updateHeaderUI() {
  const authButtons = document.getElementById('auth-buttons');
  const userMenu    = document.getElementById('user-menu');
  const adminNavWrap = document.getElementById('nav-admin-wrap');
  if (currentUser) {
    authButtons.style.display = 'none';
    userMenu.style.display    = 'block';
    document.getElementById('user-display-name').textContent = currentUser.username;
    if (adminNavWrap) adminNavWrap.style.display = currentUser.role === 'admin' ? 'block' : 'none';
    const myOrdersBtn = document.getElementById('btn-my-orders');
    if (myOrdersBtn) myOrdersBtn.style.display = currentUser.role === 'admin' ? 'none' : 'block';
    const cartNav = document.getElementById('nav-cart');
    if (cartNav) cartNav.style.display = currentUser.role === 'admin' ? 'none' : 'block';
    const cartBadge = document.getElementById('cart-badge');
    if (cartBadge && currentUser.role === 'admin') cartBadge.style.display = 'none';
  } else {
    authButtons.style.display = 'flex';
    userMenu.style.display    = 'none';
    if (adminNavWrap) adminNavWrap.style.display = 'none';
  }
}

document.getElementById('btn-user-toggle').onclick = (e) => { e.stopPropagation(); document.getElementById('user-dropdown').classList.toggle('open'); };
document.onclick = () => document.getElementById('user-dropdown').classList.remove('open');

document.getElementById('btn-logout').onclick = () => {
  localStorage.removeItem('token'); localStorage.removeItem('user');
  showToast(`Tạm biệt!`, 'success'); setTimeout(() => window.location.reload(), 1000);
};

document.getElementById('btn-my-orders').onclick = () => { navigateTo('/orders'); };
document.getElementById('btn-profile').onclick = () => { navigateTo('/profile'); };

// ═══════════════════════════════════════════════════════════════
//  AUTH LOGIC
// ═══════════════════════════════════════════════════════════════
document.getElementById('form-login').onsubmit = async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  try {
    const res = await axios.post(`${API_URL}/users/login`, { username, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    window.location.reload();
  } catch (err) { showToast('Sai thông tin đăng nhập!', 'error'); }
};

document.getElementById('form-register').onsubmit = async (e) => {
  e.preventDefault();
  const full_name = document.getElementById('reg-fullname').value;
  const username = document.getElementById('reg-username').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})/.test(password)) {
    showToast('Mật khẩu chưa đủ mạnh (≥8 ký tự, gồm số, chữ hoa, chữ thường)', 'warning');
    return;
  }
  try {
    await axios.post(`${API_URL}/users/register`, { full_name, username, email, password });
    showToast('Đăng ký thành công!', 'success'); closeModal('modal-register'); openModal('modal-login');
  } catch (err) { showToast('Thông tin đã tồn tại hoặc lỗi server!', 'error'); }
};

// ═══════════════════════════════════════════════════════════════
//  PRODUCT LOGIC
// ═══════════════════════════════════════════════════════════════
async function loadProducts(category = 'all') {
  try {
    const url = category === 'all' ? `${API_URL}/products` : `${API_URL}/products?category=${encodeURIComponent(category)}`;
    const res = await axios.get(url);
    allProducts = res.data;
    renderProducts(allProducts);
  } catch (err) { console.error(err); }
}

document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadProducts(btn.dataset.cat);
  }
});

function renderProducts(products) {
  const grid = document.getElementById('product-list');
  grid.innerHTML = products.map(p => `
    <div class="product-card">
      <img src="${p.image_url || 'https://placehold.co/300x220/e8f5e2/2d5a27?text=🌿'}" class="product-img">
      <div class="product-info">
        <div class="product-cat">${p.category}</div>
        <div class="product-name" style="font-weight:800">${p.product_name}</div>
        <div class="product-desc" style="font-size:0.8rem;color:#666;height:2.4rem;overflow:hidden">${p.description}</div>
        <div class="product-footer" style="margin-top:1rem;display:flex;justify-content:space-between;alignItems:center">
          <div class="product-price" style="color:var(--primary);font-weight:800">${Number(p.price).toLocaleString()}đ</div>
          <div style="font-size:0.7rem;color:#999">Kho: ${p.stock_quantity}</div>
        </div>
        ${currentUser?.role !== 'admin' ? `
           <button class="btn-primary" onclick="addToCart(${p.product_id})" style="width:100%;margin-top:1rem">🛒 Thêm vào giỏ</button>
           <button class="btn-outline" onclick="openChatWithProduct(${p.product_id})" style="width:100%;margin-top:0.5rem">💬 Nhắn tin tư vấn</button>
        ` : ''}
        ${currentUser?.role === 'admin' ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-top:0.5rem">
             <button class="btn-outline" onclick="openEditProduct(${p.product_id})" style="padding:0.4rem;fontSize:0.8rem">Sửa</button>
             <button class="btn-outline" onclick="deleteProduct(${p.product_id})" style="padding:0.4rem;fontSize:0.8rem;borderColor:#c0392b;color:#c0392b">Xóa</button>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

window.addToCart = async (productId) => {
  if (!token) { openModal('modal-login'); return; }
  try {
    await axios.post(`${API_URL}/carts/add`, { product_id: productId, quantity: 1 }, { headers: { Authorization: `Bearer ${token}` } });
    showToast('Đã thêm vào giỏ!', 'success'); updateCartBadge();
  } catch (err) { showToast('Lỗi khi thêm!', 'error'); }
};

window.deleteProduct = async (id) => {
  // Xóa thẳng, không cần xác nhận như yêu cầu
  try {
    await axios.delete(`${API_URL}/products/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    showToast('Đã xóa sản phẩm!'); loadProducts();
  } catch (err) { showToast('Lỗi khi xóa!', 'error'); }
};

window.loadProfile = async () => {
  const page = document.getElementById('page-profile');
  page.innerHTML = '<p>Đang tải...</p>';
  try {
    const res = await axios.get(`${API_URL}/users/profile`, { headers: { Authorization: `Bearer ${token}` } });
    const user = res.data;
    
    // Tải danh sách địa chỉ
    const addrRes = await axios.get(`${API_URL}/users/addresses`, { headers: { Authorization: `Bearer ${token}` } });
    const addresses = addrRes.data;

    page.innerHTML = `
      <h2 class="section-title">Hồ sơ cá nhân</h2>
      <div style="background: white; padding: 2rem; border-radius: var(--radius); box-shadow: var(--shadow-sm); border: 1px solid var(--border); margin-bottom: 2rem;">
        <form id="form-profile">
          <div class="input-group">
            <label>Họ và tên</label>
            <input type="text" id="prof-fullname" value="${user.full_name || ''}" />
          </div>
          <div class="input-group">
            <label>Số điện thoại chính</label>
            <input type="text" id="prof-phone" value="${user.phone || ''}" />
          </div>
          <button type="submit" class="btn-primary" style="margin-top: 1rem;">Cập nhật thông tin chính</button>
        </form>
      </div>

      <div style="background: white; padding: 2.5rem; border-radius: var(--radius); box-shadow: var(--shadow-sm); border: 1px solid var(--border);">
         <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
           <h3 style="margin:0;">Sổ địa chỉ giao hàng</h3>
           <button class="btn-outline" style="padding:0.4rem 0.8rem; font-size:0.85rem" onclick="openAddressModal()">+ Thêm địa chỉ mới</button>
         </div>
         <div id="address-list">
            ${addresses.map(a => `
              <div style="background:#fcfcfc; border:1px solid var(--border); border-radius:12px; padding:1.2rem; margin-bottom:1rem; position:relative; transition: all 0.2s hover {box-shadow: var(--shadow-sm)}">
                 ${a.is_default ? '<span style="background:var(--primary); color:white; font-size:0.7rem; padding:0.15rem 0.6rem; border-radius:99px; position:absolute; top:12px; right:12px; font-weight:700">MẶC ĐỊNH</span>' : ''}
                 <div style="font-weight:800; font-size:1.05rem">${a.full_name}</div>
                 <div style="font-size:0.9rem; color:#555; margin:0.4rem 0;"><i class="phone-icon">📞</i> ${a.phone}</div>
                 <div style="font-size:0.95rem; color:var(--text); line-height:1.4;">${a.address}</div>
                 <div style="margin-top:1.2rem; display:flex; gap:1rem; border-top:1px solid #eee; padding-top:1rem;">
                    ${!a.is_default ? `<button class="link-btn" style="color:var(--primary); font-size:0.85rem; font-weight:700" onclick="setDefaultAddress(${a.address_id})">Đặt làm mặc định</button>` : ''}
                    <button class="link-btn" style="color:#c0392b; font-size:0.85rem; font-weight:700" onclick="deleteAddress(${a.address_id})">Xóa địa chỉ</button>
                 </div>
              </div>
            `).join('')}
            ${addresses.length === 0 ? '<div style="text-align:center; padding:2rem; background:#f9f9f9; border-radius:12px; color:#999;">Bạn chưa có địa chỉ giao hàng nào lưu lại.</div>' : ''}
         </div>
      </div>
    `;

    document.getElementById('form-profile').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await axios.put(`${API_URL}/users/profile`, {
          full_name: document.getElementById('prof-fullname').value,
          phone: document.getElementById('prof-phone').value
        }, { headers: { Authorization: `Bearer ${token}` } });
        showToast('Đã cập nhật thông tin!', 'success');
      } catch(err) { showToast('Lỗi cập nhật!', 'error'); }
    }
    } catch (err) {
      console.error(err);
      page.innerHTML = `<div style="text-align:center; padding:3rem;">
        <p style="color:#c0392b;">Không thể tải thông tin hồ sơ. Vui lòng thử lại sau.</p>
        <button class="btn-outline" onclick="loadProfile()" style="margin-top:1rem;">Thử lại</button>
      </div>`;
    }
};

window.openAddressModal = () => {
    document.getElementById('form-address').reset();
    document.getElementById('address-id-edit').value = '';
    openModal('modal-address');
};

window.deleteAddress = async (id) => {
    if (!confirm('Xác nhận xóa địa chỉ này?')) return;
    try {
        await axios.delete(`${API_URL}/users/addresses/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        showToast('Đã xóa địa chỉ thành công!');
        loadProfile();
    } catch(err) { showToast('Lỗi khi xóa địa chỉ!'); }
};

window.setDefaultAddress = async (id) => {
    try {
        await axios.put(`${API_URL}/users/addresses/${id}/default`, {}, { headers: { Authorization: `Bearer ${token}` } });
        showToast('Đã đổi địa chỉ mặc định mới!');
        loadProfile();
    } catch(err) { showToast('Lỗi hệ thống!'); }
};

document.getElementById('form-address').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        full_name: document.getElementById('address-fullname').value,
        phone: document.getElementById('address-phone').value,
        address: document.getElementById('address-text').value,
        is_default: document.getElementById('address-default').checked
    };
    try {
        await axios.post(`${API_URL}/users/addresses`, data, { headers: { Authorization: `Bearer ${token}` } });
        showToast('Đã lưu địa chỉ mới!', 'success');
        closeModal('modal-address');
        loadProfile();
    } catch(err) { showToast('Lỗi khi lưu địa chỉ!'); }
};

document.getElementById('close-address-modal').onclick = () => closeModal('modal-address');

window.loadChangePassword = () => {
  const page = document.getElementById('page-password');
  page.innerHTML = `
      <h2 class="section-title">Đổi mật khẩu bảo mật</h2>
      <div style="background: white; padding: 2rem; border-radius: var(--radius); box-shadow: var(--shadow-sm); border: 1px solid var(--border);">
        <form id="form-password">
          <div class="input-group">
            <label>Mật khẩu hiện tại</label>
            <input type="password" id="pw-old" required />
          </div>
          <div class="input-group">
            <label>Mật khẩu mới</label>
            <input type="password" id="pw-new" placeholder="Ít nhất 8 ký tự, 1 hoa, 1 số" required />
          </div>
          <button type="submit" class="btn-primary" style="margin-top: 1rem;">Cập nhật mật khẩu</button>
        </form>
      </div>
  `;

  document.getElementById('form-password').onsubmit = async (e) => {
    e.preventDefault();
    const old_password = document.getElementById('pw-old').value;
    const new_password = document.getElementById('pw-new').value;
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})/.test(new_password)) {
      showToast('Mật khẩu mới chưa đủ mạnh (≥8 ký tự, gồm số, chữ hoa, chữ thường)', 'warning');
      return;
    }
    try {
      await axios.put(`${API_URL}/users/change-password`, { old_password, new_password }, { headers: { Authorization: `Bearer ${token}` } });
      showToast('Đã đổi mật khẩu an toàn!', 'success');
      document.getElementById('form-password').reset();
    } catch(err) { showToast(err.response?.data?.message || 'Lỗi đổi mật khẩu!', 'error'); }
  }
};

async function loadMyOrders() {
  const page = document.getElementById('page-orders');
  page.innerHTML = '<p>Đang tải...</p>';
  try {
    const res = await axios.get(`${API_URL}/orders/my-orders`, { headers: { Authorization: `Bearer ${token}` } });
    const orders = res.data;
    if (orders.length === 0) {
      page.innerHTML = '<div class="empty-state"><h3>Bạn chưa có đơn hàng nào</h3><button class="btn-primary" onclick="goHome()">Mua ngay</button></div>';
      return;
    }
    page.innerHTML = `
      <h2 class="section-title">Đơn hàng của tôi</h2>
      ${orders.map(o => `
        <div class="cart-item" style="display:block; padding:1.5rem">
          <div style="display:flex; justify-content:space-between; margin-bottom:1rem; padding-bottom:1rem; border-bottom:1px solid #eee">
            <div><strong>Đơn hàng #${o.order_id}</strong> <span style="font-size:0.8rem; color:#888; margin-left:1rem">${new Date(o.order_date).toLocaleString()}</span></div>
            <div><span class="status-${o.status}" style="padding:0.4rem 0.8rem; border-radius:8px; font-size:0.85rem; font-weight:bold; background:#f0f8ff; color:#2471a3">${o.status}</span></div>
          </div>
          ${o.items.map(item => `
            <div style="display:flex; justify-content:space-between; margin-bottom:0.8rem; font-size:0.9rem">
              <div>${item.quantity} x ${item.product_name}</div>
              <div>${Number(item.price).toLocaleString()}đ</div>
            </div>
          `).join('')}
           <div style="text-align:right; margin-top:1rem; font-weight:800; font-size:1.1rem; color:var(--primary)">
             Tổng: ${Number(o.total_amount).toLocaleString()}đ
           </div>
        </div>
      `).join('')}
    `;
  } catch (err) { console.error(err); }
}

// ═══════════════════════════════════════════════════════════════
//  GIỎ HÀNG & CHECKOUT (PayOS)
// ═══════════════════════════════════════════════════════════════
async function loadCart() {
  const page = document.getElementById('page-cart');
  try {
    const res = await axios.get(`${API_URL}/carts`, { headers: { Authorization: `Bearer ${token}` } });
    currentCartItems = res.data;
    if (currentCartItems.length === 0) {
       page.innerHTML = '<div class="empty-state"><h3>Giỏ hàng trống</h3><button class="btn-primary" onclick="goHome()">Mua ngay</button></div>';
       return;
    }
    let total = currentCartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    page.innerHTML = `
      <h2 class="section-title">Giỏ hàng của bạn</h2>
      ${currentCartItems.map(item => `
        <div class="cart-item">
          <img src="${item.image_url}" style="width:80px;height:80px;object-fit:cover;border-radius:10px">
          <div style="flex:1">
            <div style="font-weight:800">${item.product_name}</div>
            <div style="color:var(--primary)">${Number(item.price).toLocaleString()}đ</div>
            <div style="margin-top:0.5rem">Số lượng: ${item.quantity}</div>
          </div>
          <div style="font-weight:800">${(item.price * item.quantity).toLocaleString()}đ</div>
        </div>
      `).join('')}
      <div class="cart-summary" style="margin-top:2rem;text-align:right">
        <h3>Tổng tiền: ${total.toLocaleString()}đ</h3>
        <button class="btn-primary btn-lg" onclick="openCheckoutModal()">Tiến hành thanh toán →</button>
      </div>
    `;
  } catch (err) { console.error(err); }
}

async function updateCartBadge() {
  if (!token) return;
  try {
    const res = await axios.get(`${API_URL}/carts`, { headers: { Authorization: `Bearer ${token}` } });
    const badge = document.getElementById('cart-badge');
    badge.style.display = res.data.length > 0 ? 'inline' : 'none';
    badge.textContent = res.data.length;
  } catch (err) {}
}

window.openCheckoutModal = async () => {
    const total = currentCartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    document.getElementById('checkout-summary').innerHTML = `<strong>Tổng thanh toán: ${total.toLocaleString()}đ</strong>`;

    // Load addresses
    const sel = document.getElementById('checkout-address-select');
    sel.innerHTML = '<option value="">-- Chọn địa chỉ đã lưu --</option>';
    try {
        const res = await axios.get(`${API_URL}/users/addresses`, { headers: { Authorization: `Bearer ${token}` } });
        res.data.forEach(addr => {
            const opt = document.createElement('option');
            opt.value = `${addr.full_name} | ${addr.phone} | ${addr.address}`;
            opt.textContent = `${addr.is_default ? '[MẶC ĐỊNH] ' : ''}${addr.full_name} - ${addr.address}`;
            if (addr.is_default) opt.selected = true;
            sel.appendChild(opt);
        });
    } catch(err) {}

    openModal('modal-checkout');
};

document.getElementById('form-checkout').onsubmit = async (e) => {
    e.preventDefault();
    const selAddr = document.getElementById('checkout-address-select').value;
    const manualAddr = document.getElementById('checkout-address-manual').value.trim();
    const finalAddr = manualAddr || selAddr;

    if (!finalAddr) {
        showToast('Vui lòng chọn hoặc nhập địa chỉ giao hàng!', 'warning');
        return;
    }

    const method = document.getElementById('checkout-payment').value;
    const btn = document.getElementById('btn-confirm-checkout');
    btn.disabled = true; btn.textContent = 'Đang xử lý...';

    try {
        const res = await axios.post(`${API_URL}/orders`, {
            shipping_address: finalAddr,
            payment_method: method,
            items: currentCartItems
        }, { headers: { Authorization: `Bearer ${token}` } });

        if (res.data.data?.checkout_url) {
            window.location.href = res.data.data.checkout_url;
        } else {
            showToast('Đặt hàng thành công!', 'success');
            closeModal('modal-checkout');
            navigateTo('/orders');
        }
    } catch (err) {
        const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Lỗi đặt hàng!';
        showToast(errorMsg, 'error');
    } finally { btn.disabled = false; btn.textContent = 'Xác nhận đặt hàng'; }
};

// ═══════════════════════════════════════════════════════════════
//  ADMIN LOGIC (Quản lý đa tab)
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadAdminTab(btn.dataset.tab);
    }
});

window.adminState = { tab: 'stats', data: [], page: 1, search: '', perPage: 10 };

async function loadAdminTab(tab) {
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.admin-tab-btn[data-tab="${tab}"]`);
    if (btn) btn.classList.add('active');

    const content = document.getElementById('admin-content');
    content.innerHTML = '<p>Đang tải...</p>';
    window.adminState.tab = tab;
    window.adminState.page = 1;
    window.adminState.search = '';

    if (tab === 'stats') {
        const res = await axios.get(`${API_URL}/orders/admin/stats`, { headers: { Authorization: `Bearer ${token}` } });
        content.innerHTML = `
           <div class="stats-grid">
               <div class="stat-card" style="background:var(--primary)">
                  <div class="stat-num">${res.data.total_orders}</div><div class="stat-label">Tổng đơn hàng</div>
               </div>
               <div class="stat-card" style="background:#2471a3">
                  <div class="stat-num">${res.data.pending_orders}</div><div class="stat-label">Đơn chờ xử lý</div>
               </div>
               <div class="stat-card" style="background:#d4840a">
                  <div class="stat-num">${Number(res.data.total_revenue).toLocaleString()}đ</div><div class="stat-label">Tổng doanh thu</div>
               </div>
           </div>
           
           <div style="display:grid; grid-template-columns:1fr 1fr; gap:2rem; margin-top:2rem;">
              <div class="chart-card">
                 <h3 style="margin-bottom:1rem; color:var(--primary)">Doanh thu theo sản phẩm</h3>
                 <canvas id="adminChart" style="max-height:300px"></canvas>
              </div>
              <div class="chart-card" style="overflow-y:auto; max-height:400px;">
                 <h3 style="margin-bottom:1rem; color:var(--primary)">Top sản phẩm bán chạy</h3>
                 <ul style="list-style:none;">
                    ${res.data.best_sellers.map(s => `
                      <li style="display:flex; justify-content:space-between; padding:0.8rem 0; border-bottom:1px solid var(--border);">
                         <div style="display:flex; align-items:center; gap:0.8rem;">
                           <img src="${s.image_url}" style="width:40px;height:40px;border-radius:6px;object-fit:cover;">
                           <strong>${s.product_name}</strong>
                         </div>
                         <div style="color:var(--primary); font-weight:800;">Bán: ${s.total_sold}</div>
                      </li>
                    `).join('')}
                 </ul>
              </div>
           </div>
        `;
        const ctx = document.getElementById('adminChart');
        new Chart(ctx, { type:'bar', data:{ labels:res.data.best_sellers.map(s=>s.product_name), datasets:[{ label:'Số lượng bán', data:res.data.best_sellers.map(s=>s.total_sold), backgroundColor:'rgba(45,90,39,0.7)' }] } });
    } else if (tab === 'products') {
        window.adminState.data = allProducts;
        renderAdminTable();
    } else if (tab === 'orders') {
        const res = await axios.get(`${API_URL}/orders/admin/all`, { headers: { Authorization: `Bearer ${token}` } });
        window.adminState.data = res.data;
        renderAdminTable();
    } else if (tab === 'users') {
        const res = await axios.get(`${API_URL}/users/admin/all`, { headers: { Authorization: `Bearer ${token}` } });
        window.adminState.data = res.data;
        renderAdminTable();
    }
}

window.renderAdminTable = () => {
    const s = window.adminState;
    let filtered = s.data.filter(item => {
       if (!s.search) return true;
       const kw = s.search.toLowerCase();
       if (s.tab === 'products') return item.product_name.toLowerCase().includes(kw) || item.category.toLowerCase().includes(kw);
       if (s.tab === 'orders') return item.username.toLowerCase().includes(kw) || String(item.order_id).includes(kw) || (item.phone && item.phone.includes(kw));
       if (s.tab === 'users') return item.username.toLowerCase().includes(kw) || item.email.toLowerCase().includes(kw);
       return true;
    });

    const totalPages = Math.ceil(filtered.length / s.perPage) || 1;
    if (s.page > totalPages) s.page = totalPages;
    const start = (s.page - 1) * s.perPage;
    const currentData = filtered.slice(start, start + s.perPage);

    let html = `
       <div style="display:flex; justify-content:space-between; margin-bottom:1rem; align-items:center;">
          <input type="text" id="admin-search" value="${s.search}" placeholder="Tìm kiếm..." style="padding:0.6rem 1rem; border-radius:8px; border:1px solid var(--border); width:300px; outline:none;">
          ${s.tab === 'products' ? `<button class="btn-primary" onclick="openAddProduct()">+ Thêm sản phẩm</button>` : ''}
       </div>
       <table style="width:100%; border-collapse:collapse; margin-top:1rem;" border="1">
    `;

    if (s.tab === 'products') {
        html += `
           <thead><tr><th>Ảnh</th><th>Tên</th><th>Giá</th><th>Kho</th><th>Hành động</th></tr></thead>
           <tbody>${currentData.map(p => `<tr>
              <td><img src="${p.image_url}" width="40" style="border-radius:6px; height:40px; object-fit:cover;"></td>
              <td>${p.product_name}</td>
              <td style="color:var(--primary); font-weight:700;">${Number(p.price).toLocaleString()}đ</td>
              <td>${p.stock_quantity}</td>
              <td>
                 <button class="btn-outline" onclick="openEditProduct(${p.product_id})" style="padding:0.3rem 0.6rem; font-size:0.8rem; margin-right:0.5rem;">Sửa</button> 
                 <button class="btn-outline" onclick="deleteProduct(${p.product_id})" style="padding:0.3rem 0.6rem; font-size:0.8rem; border-color:#c0392b; color:#c0392b;">Xóa</button>
              </td>
           </tr>`).join('')}</tbody>`;
    } else if (s.tab === 'orders') {
        html += `
           <thead><tr><th>Mã ĐH</th><th>Khách hàng</th><th>SĐT</th><th>Thanh toán</th><th>Tổng tiền</th><th>Trạng thái</th><th>Hành động</th></tr></thead>
           <tbody>${currentData.map(o => `<tr>
              <td style="font-weight:700">#${o.order_id}</td>
              <td>${o.username}</td>
              <td>${o.phone || '-'}</td>
              <td><span style="font-size:0.8rem; background:#f0f0f0; padding:0.2rem 0.5rem; border-radius:4px;">${o.payment_method}</span></td>
              <td style="color:var(--primary); font-weight:700;">${Number(o.total_amount).toLocaleString()}đ</td>
              <td><span class="status-${o.status}">${o.status}</span></td>
              <td>
                 <select onchange="updateOrderStatus(${o.order_id}, this.value)" style="padding:0.4rem; border-radius:6px; border:1px solid var(--border); font-family:inherit; outline:none; cursor:pointer;">
                    <option value="pending" ${o.status==='pending'?'selected':''}>Chờ xử lý</option>
                    <option value="paid" ${o.status==='paid'?'selected':''}>Đã thanh toán</option>
                    <option value="processing" ${o.status==='processing'?'selected':''}>Đang xử lý</option>
                    <option value="shipped" ${o.status==='shipped'?'selected':''}>Giao hàng</option>
                    <option value="completed" ${o.status==='completed'?'selected':''}>Hoàn thành</option>
                    <option value="cancelled" ${o.status==='cancelled'?'selected':''}>Hủy</option>
                 </select>
              </td>
           </tr>`).join('')}</tbody>`;
    } else if (s.tab === 'users') {
        html += `
           <thead><tr><th>ID</th><th>Tên đăng nhập</th><th>Họ Tên</th><th>Email</th><th>Vai trò</th><th>Hành động</th></tr></thead>
           <tbody>${currentData.map(u => `<tr>
              <td>#${u.user_id}</td>
              <td style="font-weight:600;">${u.username}</td>
              <td>${u.full_name || '-'}</td>
              <td>${u.email}</td>
              <td><span style="background:${u.role==='admin'?'var(--primary-pale)':'#f0f0f0'}; color:${u.role==='admin'?'var(--primary)':'#666'}; padding:0.2rem 0.6rem; border-radius:4px; font-size:0.85rem; font-weight:700;">${u.role}</span></td>
              <td>
                 ${u.user_id !== currentUser.user_id ? `
                   <button class="btn-outline" onclick="openEditUser(${u.user_id})" style="padding:0.3rem 0.6rem; font-size:0.8rem; margin-right:0.5rem;">Sửa</button>
                   <button class="btn-outline" onclick="toggleUserRole(${u.user_id}, '${u.role}')" style="padding:0.3rem 0.6rem; font-size:0.8rem; margin-right:0.5rem;">${u.role === 'customer' ? 'Cấp Admin' : 'Hạ quyền'}</button>
                   <button class="btn-outline" onclick="deleteUser(${u.user_id})" style="padding:0.3rem 0.6rem; font-size:0.8rem; border-color:#c0392b; color:#c0392b;">Xóa</button>
                 ` : '<span style="font-size:0.8rem; color:#999">Bạn (Hệ thống)</span>'}
              </td>
           </tr>`).join('')}</tbody>`;
    }

    html += `</table>`;

    // Pagination controls
    html += `
       <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1.5rem;">
          <div style="font-size:0.9rem; color:var(--text-muted)">Hiển thị ${filtered.length > 0 ? start + 1 : 0}-${Math.min(start + s.perPage, filtered.length)} / ${filtered.length}</div>
          <div style="display:flex; gap:0.5rem;">
             <button class="btn-outline" style="padding:0.3rem 0.8rem;" onclick="adminState.page = Math.max(1, adminState.page-1); renderAdminTable()" ${s.page === 1 ? 'disabled' : ''}>← Trước</button>
             <div style="display:flex; align-items:center; justify-content:center; width:30px; font-weight:700;">${s.page}</div>
             <button class="btn-outline" style="padding:0.3rem 0.8rem;" onclick="adminState.page = Math.min(${totalPages}, adminState.page+1); renderAdminTable()" ${s.page === totalPages ? 'disabled' : ''}>Sau →</button>
          </div>
       </div>
    `;

    document.getElementById('admin-content').innerHTML = html;
    
    // Bind search event efficiently
    const searchInput = document.getElementById('admin-search');
    searchInput.focus();
    searchInput.setSelectionRange(s.search.length, s.search.length);
    searchInput.onkeyup = (e) => {
       window.adminState.search = e.target.value;
       window.adminState.page = 1;
       renderAdminTable();
    };
};

window.toggleUserRole = async (id, currentRole) => {
    // Note: This relies on an API that doesn't exist, I'll add the API below.
    if (!confirm('Bạn có chắc chắn muốn thay đổi quyền của user này?')) return;
    try {
        await axios.put(`${API_URL}/users/admin/${id}/role`, { role: currentRole === 'customer' ? 'admin' : 'customer' }, { headers: { Authorization: `Bearer ${token}` } });
        showToast('Đã đổi quyền user!'); loadAdminTab('users');
    } catch(err) { showToast('Lỗi cập nhật quyền!', 'error') }
};

window.deleteUser = async (id) => {
    if (!confirm('Xóa user này?')) return;
    try {
        await axios.delete(`${API_URL}/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        showToast('Đã xóa user!'); loadAdminTab('users');
    } catch (err) { showToast('Lỗi khi xóa!', 'error'); }
};

document.getElementById('close-edit-user').onclick = () => closeModal('modal-edit-user');

window.openEditUser = (id) => {
    const user = window.adminState.data.find(x => x.user_id === id);
    if (!user) return;
    document.getElementById('edit-user-id').value = user.user_id;
    document.getElementById('edit-user-fullname').value = user.full_name || '';
    document.getElementById('edit-user-phone').value = user.phone || '';
    openModal('modal-edit-user');
};

document.getElementById('form-edit-user').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-user-id').value;
    const full_name = document.getElementById('edit-user-fullname').value;
    const phone = document.getElementById('edit-user-phone').value;
    try {
        await axios.put(`${API_URL}/users/admin/${id}/update`, { full_name, phone }, { headers: { Authorization: `Bearer ${token}` } });
        showToast('Sửa thông tin thành công!', 'success');
        closeModal('modal-edit-user');
        loadAdminTab('users');
    } catch(err) { showToast('Lỗi cập nhật user!', 'error'); }
};

// Admin Chat sidebar injection
async function setupAdminChat() {
    if (currentUser?.role === 'admin') {
        const sidebar = document.getElementById('admin-chat-sidebar');
        if (sidebar) sidebar.style.display = 'flex';
        
        try {
            const res = await axios.get(`${API_URL}/messages/admin/chats`, { headers: { Authorization: `Bearer ${token}` } });
            const listDiv = document.getElementById('admin-chat-user-list');
            const validUsers = res.data; // Server already filtered out admins and sorted by date
            
            if (validUsers.length === 0) {
                listDiv.innerHTML = '<div style="padding:1rem; text-align:center; color:#999;">Chưa có hội thoại nào.</div>';
                return;
            }

            listDiv.innerHTML = validUsers.map(u => {
                const unread = Number(u.unread_count) > 0 ? `<span style="background:#c0392b; color:white; font-size:0.7rem; padding:0.1rem 0.4rem; border-radius:99px; float:right;">${u.unread_count}</span>` : '';
                return `<div class="admin-chat-user-item" 
                      style="padding:1rem; border-bottom:1px solid var(--border); cursor:pointer; background: ${window.currentChatUserId === u.user_id ? 'var(--primary-pale)' : 'white'}; display:flex; justify-content:space-between; align-items:center;"
                      onclick="selectAdminChatUser(${u.user_id}, '${u.username}')">
                    <div style="font-weight:700; color:${window.currentChatUserId === u.user_id ? 'var(--primary)' : 'var(--text)'}; flex:1;">${u.username}</div>
                    ${unread}
                </div>`;
            }).join('');
            
            if (!window.currentChatUserId && validUsers.length > 0) {
               selectAdminChatUser(validUsers[0].user_id, validUsers[0].username);
            }
        } catch(err) {}
    }
}

window.selectAdminChatUser = (id, username) => {
    window.currentChatUserId = id;
    document.getElementById('chat-header-sub').textContent = 'Đang hỗ trợ khách hàng: ' + username;
    fetchAndRenderMessages(id).then(() => {
        setupAdminChat(); // re-render sidebar to clear unread counts / active class
    });
};
setupAdminChat();

window.openAddProduct = () => {
    document.getElementById('product-modal-title').textContent = 'Thêm sản phẩm mới';
    document.getElementById('form-product').reset();
    document.getElementById('product-id-edit').value = '';
    openModal('modal-product');
};

window.openEditProduct = (id) => {
    const p = allProducts.find(x => x.product_id === id);
    document.getElementById('product-modal-title').textContent = 'Sửa sản phẩm';
    document.getElementById('product-id-edit').value = p.product_id;
    document.getElementById('prod-name').value = p.product_name;
    document.getElementById('prod-price').value = p.price;
    document.getElementById('prod-stock').value = p.stock_quantity;
    document.getElementById('prod-category').value = p.category;
    document.getElementById('prod-desc').value = p.description;
    document.getElementById('prod-image-url').value = p.image_url;
    openModal('modal-product');
};

document.getElementById('form-product').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('product-id-edit').value;
    const formData = new FormData();
    formData.append('product_name', document.getElementById('prod-name').value);
    formData.append('price', document.getElementById('prod-price').value);
    formData.append('stock_quantity', document.getElementById('prod-stock').value);
    formData.append('category', document.getElementById('prod-category').value);
    formData.append('description', document.getElementById('prod-desc').value);
    formData.append('image_url', document.getElementById('prod-image-url').value);
    if (document.getElementById('prod-image-file').files[0]) {
        formData.append('image', document.getElementById('prod-image-file').files[0]);
    }

    try {
        if (id) {
            await axios.put(`${API_URL}/products/${id}`, formData, { headers: { Authorization: `Bearer ${token}` } });
        } else {
            await axios.post(`${API_URL}/products`, formData, { headers: { Authorization: `Bearer ${token}` } });
        }
        showToast('Đã lưu sản phẩm!'); closeModal('modal-product'); loadProducts();
    } catch (err) { showToast('Lỗi khi lưu!', 'error'); }
};

window.updateOrderStatus = async (id, status) => {
    try {
        await axios.put(`${API_URL}/orders/${id}/status`, { status }, { headers: { Authorization: `Bearer ${token}` } });
        showToast('Đã cập nhật trạng thái đơn hàng!');
    } catch (err) { showToast('Lỗi cập nhật!', 'error'); }
};

// ═══════════════════════════════════════════════════════════════
//  KHỞI CHẠY
// ═══════════════════════════════════════════════════════════════
updateHeaderUI(); loadProducts(); if (currentUser && currentUser.role !== 'admin') { updateCartBadge(); }
handleRoute();
