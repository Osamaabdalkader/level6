// auth.js - الملف المشترك للمصادقة (الإصدار المعدل)
import { auth, onAuthStateChanged, signOut } from './firebase.js';
import { checkAdminStatus, onValue, ref, database, set } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from './firebase.js';

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.userData = null;
    this.isAdmin = false;
    this.adminListeners = [];
    this.setupAuthEventListeners();
  }

  async init() {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        this.currentUser = user;
        if (user) {
          console.log("تم تسجيل دخول المستخدم:", user.uid);
          // التحقق من صلاحية المشرف
          await this.checkAndUpdateAdminStatus(user.uid);
          
          // إعداد مستمع لتغيرات حالة المشرف
          this.setupAdminStatusListener(user.uid);
          
          resolve(user);
        } else {
          console.log("لا يوجد مستخدم مسجل دخول");
          this.isAdmin = false;
          this.updateAuthUI(false);
          resolve(null);
        }
      });
    });
  }

  setupAuthEventListeners() {
    // تسجيل الدخول
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // إنشاء حساب
    const signupBtn = document.getElementById('signup-btn');
    if (signupBtn) {
      signupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleSignup();
      });
    }

    // تغيير علامات التوثيق
    const authTabs = document.querySelector('.auth-tabs');
    if (authTabs) {
      authTabs.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) {
          document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          
          if (e.target.dataset.tab === 'login') {
            document.getElementById('login-form').classList.remove('hidden');
            document.getElementById('signup-form').classList.add('hidden');
          } else {
            document.getElementById('login-form').classList.add('hidden');
            document.getElementById('signup-form').classList.remove('hidden');
          }
          
          this.hideAuthMessage();
        }
      });
    }
  }

  async handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const authMessage = document.getElementById('auth-message');
    
    if (!email || !password) {
      this.showAuthMessage('يرجى ملء جميع الحقول', 'error');
      return;
    }
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      this.showAuthMessage('تم تسجيل الدخول بنجاح!', 'success');
      
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1000);
    } catch (error) {
      this.showAuthMessage(this.getAuthErrorMessage(error.code), 'error');
    }
  }

  async handleSignup() {
    const name = document.getElementById('signup-name').value;
    const phone = document.getElementById('signup-phone').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const address = document.getElementById('signup-address').value;
    
    if (!name || !phone || !email || !password) {
      this.showAuthMessage('يرجى ملء جميع الحقول الإلزامية', 'error');
      return;
    }
    
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // حفظ بيانات المستخدم الإضافية في قاعدة البيانات
      const userData = {
        name: name,
        phone: phone,
        email: email,
        address: address,
        createdAt: Date.now(),
        isAdmin: false
      };
      
      await set(ref(database, 'users/' + user.uid), userData);
      
      this.showAuthMessage('تم إنشاء الحساب بنجاح!', 'success');
      
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1000);
    } catch (error) {
      this.showAuthMessage(this.getAuthErrorMessage(error.code), 'error');
    }
  }

  async checkAndUpdateAdminStatus(userId) {
    try {
      console.log("جاري التحقق من صلاحية المشرف للمستخدم:", userId);
      this.isAdmin = await checkAdminStatus(userId);
      console.log("صلاحية المشرف:", this.isAdmin);
      this.updateAuthUI(true);
      return this.isAdmin;
    } catch (error) {
      console.error("Error checking admin status:", error);
      this.isAdmin = false;
      this.updateAuthUI(true);
      return false;
    }
  }

  setupAdminStatusListener(userId) {
    // التوقف عن أي مستمعين سابقين
    this.removeAdminListeners();
    
    // الاستماع لتغيرات حالة المشرف في الوقت الحقيقي
    const adminStatusRef = ref(database, 'users/' + userId + '/isAdmin');
    
    const unsubscribe = onValue(adminStatusRef, (snapshot) => {
      if (snapshot.exists()) {
        this.isAdmin = snapshot.val();
        console.log("تم تحديث حالة المشرف:", this.isAdmin);
        this.updateAuthUI(true);
        
        // إشعار جميع المستمعين بالتغيير
        this.notifyAdminStatusChange(this.isAdmin);
      }
    });
    
    this.adminListeners.push(unsubscribe);
  }

  removeAdminListeners() {
    // إزالة جميع المستمعين السابقين
    this.adminListeners.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this.adminListeners = [];
  }

  addAdminStatusListener(callback) {
    this.adminListeners.push(callback);
  }

  notifyAdminStatusChange(isAdmin) {
    this.adminListeners.forEach(callback => {
      if (typeof callback === 'function') {
        callback(isAdmin);
      }
    });
  }

  async handleLogout() {
    try {
      this.removeAdminListeners();
      await signOut(auth);
      window.location.href = 'index.html';
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }

  updateAuthUI(isLoggedIn) {
    const authElements = document.querySelectorAll('.auth-only');
    const unauthElements = document.querySelectorAll('.unauth-only');
    const adminElements = document.querySelectorAll('.admin-only');
    
    if (isLoggedIn) {
      authElements.forEach(el => el.style.display = 'block');
      unauthElements.forEach(el => el.style.display = 'none');
      
      // إظهار عناصر المشرفين فقط إذا كان المستخدم مشرفاً
      if (this.isAdmin) {
        adminElements.forEach(el => {
          el.style.display = 'block';
          console.log("تم عرض عنصر المشرفين:", el);
        });
      } else {
        adminElements.forEach(el => {
          el.style.display = 'none';
          console.log("تم إخفاء عنصر المشرفين:", el);
        });
      }
    } else {
      authElements.forEach(el => el.style.display = 'none');
      adminElements.forEach(el => el.style.display = 'none');
      unauthElements.forEach(el => el.style.display = 'block');
    }
  }

  showAuthMessage(message, type) {
    const authMessage = document.getElementById('auth-message');
    if (!authMessage) return;
    
    authMessage.textContent = message;
    authMessage.className = `alert alert-${type}`;
    authMessage.style.display = 'block';
    
    setTimeout(() => {
      authMessage.style.display = 'none';
    }, 3000);
  }

  hideAuthMessage() {
    const authMessage = document.getElementById('auth-message');
    if (authMessage) {
      authMessage.style.display = 'none';
    }
  }

  getAuthErrorMessage(code) {
    switch(code) {
      case 'auth/invalid-email': return 'البريد الإلكتروني غير صالح';
      case 'auth/user-disabled': return 'هذا الحساب معطل';
      case 'auth/user-not-found': return 'لا يوجد حساب مرتبط بهذا البريد الإلكتروني';
      case 'auth/wrong-password': return 'كلمة المرور غير صحيحة';
      case 'auth/email-already-in-use': return 'هذا البريد الإلكتروني مستخدم بالفعل';
      case 'auth/weak-password': return 'كلمة المرور ضعيفة (يجب أن تحتوي على 6 أحرف على الأقل)';
      default: return 'حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى';
    }
  }

  // التحقق من صلاحية المشرف - الإصدار المعدل
  async checkAdminAccess() {
    try {
      if (!this.currentUser) {
        console.log("لا يوجد مستخدم حالي");
        return false;
      }
      
      console.log("التحقق من صلاحية المشرف للمستخدم:", this.currentUser.uid);
      
      // التحقق مباشرة من قاعدة البيانات
      const isAdmin = await checkAdminStatus(this.currentUser.uid);
      console.log("نتيجة التحقق من الصلاحية:", isAdmin);
      
      if (!isAdmin) {
        console.log("ليست لديك صلاحية الوصول إلى هذه الصفحة");
        return false;
      }
      
      console.log("تم التحقق من الصلاحية بنجاح");
      return true;
    } catch (error) {
      console.error("خطأ في التحقق من صلاحية المشرف:", error);
      return false;
    }
  }
}

export const authManager = new AuthManager();
