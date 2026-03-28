/* ── Vendio Theme Manager ── */
(function(){
  // Apply theme immediately (before paint) to avoid flash
  const saved = localStorage.getItem('vendio-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);

  window.VendioTheme = {
    current: () => document.documentElement.getAttribute('data-theme') || 'light',
    set: function(mode) {
      document.documentElement.setAttribute('data-theme', mode);
      localStorage.setItem('vendio-theme', mode);
      // Update all toggle buttons/icons if present
      document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
        const isDark = mode === 'dark';
        btn.innerHTML = isDark
          ? '<i class="fas fa-sun"></i>'
          : '<i class="fas fa-moon"></i>';
        btn.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      });
    },
    toggle: function() {
      const next = this.current() === 'dark' ? 'light' : 'dark';
      this.set(next);
    },
    init: function() {
      // Re-apply after DOM ready to update toggle buttons
      document.addEventListener('DOMContentLoaded', () => {
        this.set(this.current());
        document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
          btn.addEventListener('click', () => this.toggle());
        });
      });
    }
  };

  VendioTheme.init();
})();
