// Public, non-secret configuration for admin.html.
// The Worker URL is safe to expose. Passwords, session keys, and R2 credentials stay in Worker secrets.
window.ESNTLS_ADMIN_CONFIG = {
  workerUrl: 'https://your-worker.workers.dev'
};
