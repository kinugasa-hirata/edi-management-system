// ui-utils.js - UI utility functions and navigation

class UIUtils {
    static currentView = 'main';

    // Product names mapping (correct Japanese names)
    static PRODUCT_NAMES = {
        'PP4166-4681P003': 'ｱｯﾊﾟﾌﾞﾚｰﾑ',
        'PP4166-4681P004': 'ｱｯﾊﾟﾌﾞﾚｰﾑ',
        'PP4166-4726P003': 'ﾄｯﾌﾟﾌﾟﾚｰﾄ',
        'PP4166-4726P004': 'ﾄｯﾌﾟﾌﾟﾚｰﾄ',
        'PP4166-4731P002': 'ﾐﾄﾞﾙﾌﾚｰﾑ',
        'PP4166-7106P001': 'ﾐﾄﾞﾙﾌﾚｰﾑ',
        'PP4166-7106P003': 'ﾐﾄﾞﾙﾌﾚｰﾑ'
    };

    // Product icons mapping
    static PRODUCT_ICONS = {
        'PP4166-4681P003': '🔧',
        'PP4166-4681P004': '🔧',
        'PP4166-4726P003': '⚙️',
        'PP4166-4726P004': '⚙️',
        'PP4166-4731P002': '🔩',
        'PP4166-7106P001': '🔩',
        'PP4166-7106P003': '🔩'
    };

    // Show loading indicator
    static showLoading(show) {
        const loading = document.getElementById('loadingIndicator');
        if (loading) {
            loading.style.display = show ? 'block' : 'none';
        }
    }

    // Show message to user
    static showMessage(message, type) {
        const container = document.getElementById('messageContainer');
        if (!container) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
        
        container.appendChild(messageDiv);
        
        // Remove message after 5 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 5000);
    }

    // Show main dashboard
    static showMainDashboard() {
        UIUtils.currentView = 'main';
        
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // Show main dashboard
        const mainDashboard = document.getElementById('mainDashboard');
        if (mainDashboard) {
            mainDashboard.classList.add('active');
        }
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const firstTabBtn = document.querySelector('.tab-btn');
        if (firstTabBtn) {
            firstTabBtn.classList.add('active');
        }
    }

    // Show product page
    static showProductPage(drawingNumber) {
        UIUtils.currentView = drawingNumber;
        
        // Hide all tab contents
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // Show specific tab content
        const tabContent = document.getElementById(`tab-${drawingNumber}`);
        if (tabContent) {
            tabContent.classList.add('active');
        }
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const productTabBtn = document.querySelector(`[data-drawing="${drawingNumber}"]`);
        if (productTabBtn) {
            productTabBtn.classList.add('active');
        }
        
        // Generate chart for this product
        chartManager.generateProductChart(drawingNumber, dataManager.getEdiData());
    }

    // Initialize file input handlers
    static initializeFileHandlers() {
        const fileInput = document.getElementById('fileInput');
        const importBtn = document.getElementById('importBtn');

        if (fileInput && importBtn) {
            fileInput.addEventListener('change', function(e) {
                const file = e.target.files[0];
                
                if (file && authManager.canEdit()) {
                    importBtn.disabled = false;
                    importBtn.textContent = `📤 Import ${file.name}`;
                    UIUtils.showMessage(`File selected: ${file.name}`, 'success');
                } else {
                    importBtn.disabled = true;
                    importBtn.textContent = '📤 Import WebEDI Data';
                }
            });
        }
    }

    // Initialize button handlers
    static initializeButtonHandlers() {
        // Choose file button
        const chooseFileBtn = document.getElementById('chooseFileBtn');
        if (chooseFileBtn) {
            chooseFileBtn.onclick = () => {
                const fileInput = document.getElementById('fileInput');
                if (fileInput) fileInput.click();
            };
        }

        // Import button
        const importBtn = document.getElementById('importBtn');
        if (importBtn) {
            importBtn.onclick = () => dataManager.importData();
        }

        // Save all button
        const saveAllBtn = document.getElementById('saveAllBtn');
        if (saveAllBtn) {
            saveAllBtn.onclick = () => dataManager.saveAllChanges();
        }

        // Logout button
        const logoutBtns = document.querySelectorAll('.btn-logout');
        logoutBtns.forEach(btn => {
            btn.onclick = () => authManager.logout();
        });

        // Tab navigation buttons
        const tabButtons = document.querySelectorAll('.tab-btn[data-drawing]');
        tabButtons.forEach(btn => {
            const drawingNumber = btn.getAttribute('data-drawing');
            if (drawingNumber) {
                btn.onclick = () => UIUtils.showProductPage(drawingNumber);
            }
        });

        // Main dashboard tab button
        const mainTabBtn = document.querySelector('.tab-btn:not([data-drawing])');
        if (mainTabBtn) {
            mainTabBtn.onclick = () => UIUtils.showMainDashboard();
        }
    }

    // Initialize the entire UI
    static async initialize() {
        try {
            // Load user authentication info
            await authManager.loadUserInfo();
            
            // Load EDI data
            await dataManager.loadData();
            
            // Initialize file and button handlers
            UIUtils.initializeFileHandlers();
            UIUtils.initializeButtonHandlers();
            
            // Set up auto-refresh every 5 minutes
            setInterval(() => {
                dataManager.loadData();
            }, 300000);
            
            console.log('✅ Dashboard initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize dashboard:', error);
            UIUtils.showMessage('Failed to initialize dashboard', 'error');
        }
    }

    // Get current view
    static getCurrentView() {
        return UIUtils.currentView;
    }
}

// Global functions for onclick handlers (for backward compatibility)
function showMainDashboard() {
    UIUtils.showMainDashboard();
}

function showProductPage(drawingNumber) {
    UIUtils.showProductPage(drawingNumber);
}

function logout() {
    authManager.logout();
}