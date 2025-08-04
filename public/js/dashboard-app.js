// dashboard-app.js - Complete Enhanced EDI Dashboard Application with Stock Integration

class EDIDashboard {
    constructor() {
        this.ediData = [];
        this.forecastData = {};
        this.materialStocks = {}; // Material stock data
        this.stockCalculations = {}; // Stock consumption calculations
        this.currentView = 'main';
        this.userPermissions = { canEdit: false, canView: true };
        this.currentUser = null;
        
        // Drawing Number order
        this.DRAWING_NUMBER_ORDER = [
            'PP4166-4681P003',
            'PP4166-4681P004', 
            'PP4166-4726P003',
            'PP4166-4726P004',
            'PP4166-4731P002',
            'PP4166-7106P001',
            'PP4166-7106P003'
        ];

        // Product names mapping
        this.PRODUCT_NAMES = {
            'PP4166-4681P003': 'ｱｯﾊﾟﾌﾞﾚｰﾑ',
            'PP4166-4681P004': 'ｱｯﾊﾟﾌﾞﾚｰﾑ',
            'PP4166-4726P003': 'ﾄｯﾌﾟﾌﾟﾚｰﾄ',
            'PP4166-4726P004': 'ﾄｯﾌﾟﾌﾟﾚｰﾄ',
            'PP4166-4731P002': 'ﾐﾄﾞﾙﾌﾚｰﾑ',
            'PP4166-7106P001': 'ﾐﾄﾞﾙﾌﾚｰﾑ',
            'PP4166-7106P003': 'ﾐﾄﾞﾙﾌﾚｰﾑ'
        };

        // Product group mappings for material stock calculations
        this.productGroups = {
            'upper-frame': {
                name: 'ｱｯﾊﾟﾌﾞﾚｰﾑ',
                products: ['PP4166-4681P003', 'PP4166-4681P004']
            },
            'top-plate': {
                name: 'ﾄｯﾌﾟﾌﾟﾚｰﾄ',
                products: ['PP4166-4726P003', 'PP4166-4726P004']
            },
            'middle-frame': {
                name: 'ﾐﾄﾞﾙﾌﾚｰﾑ',
                products: ['PP4166-4731P002', 'PP4166-7106P001', 'PP4166-7106P003']
            }
        };
    }

    // ============ AUTHENTICATION METHODS ============
    async loadUserInfo() {
        try {
            const response = await fetch('/api/user-info');
            if (response.ok) {
                const userInfo = await response.json();
                this.currentUser = userInfo;
                this.userPermissions = userInfo.permissions;
                
                // Update UI based on permissions
                this.updateUIForPermissions();
                
                // Update user display
                this.updateUserDisplay(userInfo);
                
                return userInfo;
            } else {
                // User not logged in, redirect to login
                window.location.href = '/';
                return null;
            }
        } catch (error) {
            console.error('Error loading user info:', error);
            this.showMessage('Failed to load user information', 'error');
            return null;
        }
    }

    updateUserDisplay(userInfo) {
        const userDisplay = document.getElementById('userDisplay');
        if (userDisplay) {
            const roleClass = userInfo.role === 'admin' ? 'admin' : 'user';
            const roleText = userInfo.role === 'admin' ? 'ADMIN' : 'VIEW ONLY';
            userDisplay.innerHTML = `
                ${userInfo.username}
                <span class="user-role ${roleClass}">${roleText}</span>
            `;
        }
    }

    updateUIForPermissions() {
        const adminElements = document.querySelectorAll('.admin-only');
        const readOnlyNotice = document.getElementById('readOnlyNotice');
        const emptyStateMessage = document.getElementById('emptyStateMessage');
        const getStartedSteps = document.getElementById('getStartedSteps');

        if (!this.userPermissions.canEdit) {
            // Disable admin elements
            adminElements.forEach(element => {
                element.classList.add('disabled');
                if (element.tagName === 'BUTTON') {
                    element.disabled = true;
                }
            });
            
            // Show read-only notice
            if (readOnlyNotice) readOnlyNotice.classList.add('show');
            
            // Update empty state message for read-only users
            if (emptyStateMessage && getStartedSteps) {
                emptyStateMessage.textContent = 'No EDI data available. Contact admin to import data.';
                getStartedSteps.style.display = 'none';
            }
        } else {
            // Enable admin elements
            adminElements.forEach(element => {
                element.classList.remove('disabled');
                if (element.tagName === 'BUTTON') {
                    element.disabled = false;
                }
            });
            
            // Hide read-only notice
            if (readOnlyNotice) readOnlyNotice.classList.remove('show');
        }
    }

    async logout() {
        try {
            await fetch('/api/logout', { method: 'POST' });
            window.location.href = '/';
        } catch (error) {
            console.error('Logout error:', error);
            window.location.href = '/';
        }
    }

    // ============ DATA MANAGEMENT METHODS ============
    async loadData() {
        try {
            this.showLoading(true);
            
            const response = await fetch('/api/edi-data');
            
            if (response.status === 401) {
                this.showMessage('Session expired. Please log in again.', 'error');
                setTimeout(() => {
                    window.location.href = '/';
                }, 2000);
                return;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.ediData = data;
            
            // Load forecast data
            await this.loadForecastData();
            
            // Load material stock data and calculate consumption
            await this.loadMaterialStockData();
            
            // Update UI
            this.renderTable();
            this.updateAllProductCharts();
            
            // Notify other windows about data update
            this.notifyOtherWindows('EDI_UPDATED');
            
        } catch (error) {
            this.showMessage('Failed to load data: ' + error.message, 'error');
            console.error('Error loading data:', error);
        } finally {
            this.showLoading(false);
        }
    }

    // Enhanced forecast data loading with better debugging and type conversion
    async loadForecastData() {
        try {
            console.log('📈 Dashboard: Starting forecast data load...');
            const response = await fetch('/api/forecasts');
            
            if (response.ok) {
                const forecasts = await response.json();
                console.log('📈 Dashboard: Raw forecast data from API:', forecasts);
                console.log('📈 Dashboard: Forecast count:', forecasts.length);
                
                // Convert array to object for easier lookup with enhanced debugging
                this.forecastData = {};
                forecasts.forEach((forecast, index) => {
                    // Ensure consistent date formatting
                    let monthDate = forecast.month_date;
                    
                    // Handle different date formats that might come from the API
                    if (monthDate && monthDate.includes('/')) {
                        const parts = monthDate.split('/');
                        if (parts.length >= 2) {
                            const month = parts[0].padStart(2, '0');
                            const day = parts[1] || '01';
                            monthDate = `${month}/${day.padStart(2, '0')}`;
                        }
                    }
                    
                    const key = `${forecast.drawing_number}-${monthDate}`;
                    
                    // Enhanced type conversion
                    let quantity = forecast.quantity;
                    if (typeof quantity === 'string') {
                        quantity = parseFloat(quantity);
                    }
                    
                    this.forecastData[key] = quantity;
                    console.log(`📈 Dashboard: Loaded forecast ${index + 1}: ${key} = ${quantity} (original: ${forecast.quantity}, type: ${typeof quantity})`);
                });
                
                console.log('📈 Dashboard: Processed forecast data keys:', Object.keys(this.forecastData));
                console.log('📈 Dashboard: Processed forecast data values:', this.forecastData);
                console.log('📈 Dashboard: Total forecast entries:', Object.keys(this.forecastData).length);
                console.log('✅ Forecast data loaded successfully');
                
                // Immediate verification - check if we have data for current products
                this.verifyForecastDataIntegrity();
                
            } else {
                console.warn('⚠️ Failed to load forecast data:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('❌ Error loading forecast data:', error);
            // Don't show error message as forecast is optional
        }
    }

    // Enhanced material stock data loading with localStorage fallback
    async loadMaterialStockData() {
        try {
            console.log('📦 Dashboard: Loading material stock data...');
            
            let stockDataLoaded = false;
            
            // Try to load from API first
            try {
                const response = await fetch('/api/material-stocks');
                if (response.ok) {
                    const stockData = await response.json();
                    // Convert API data to the format we need
                    this.materialStocks = {};
                    stockData.forEach(stock => {
                        this.materialStocks[stock.group_key] = {
                            quantity: stock.quantity,
                            groupName: stock.group_name,
                            lastUpdated: stock.updated_at
                        };
                    });
                    console.log('📦 Loaded stock data from API:', this.materialStocks);
                    stockDataLoaded = true;
                }
            } catch (apiError) {
                console.warn('⚠️ API load failed, trying localStorage:', apiError);
            }
            
            // Fallback to localStorage if API failed
            if (!stockDataLoaded) {
                try {
                    const savedStocks = localStorage.getItem('materialStocks');
                    if (savedStocks) {
                        const stockData = JSON.parse(savedStocks);
                        this.materialStocks = {};
                        Object.keys(stockData).forEach(key => {
                            if (key !== 'lastSaved' && key !== 'calculationsGenerated') {
                                this.materialStocks[key] = stockData[key];
                            }
                        });
                        console.log('📦 Loaded stock data from localStorage:', this.materialStocks);
                        stockDataLoaded = true;
                    }
                } catch (localError) {
                    console.error('❌ localStorage load also failed:', localError);
                }
            }
            
            // Load detailed calculations from localStorage if available
            try {
                const savedCalculations = localStorage.getItem('stockCalculations');
                if (savedCalculations) {
                    this.stockCalculations = JSON.parse(savedCalculations);
                    console.log('📦 Loaded detailed stock calculations from localStorage');
                }
            } catch (calcError) {
                console.warn('⚠️ Could not load stock calculations:', calcError);
            }
            
            // Calculate stock consumption after loading
            if (stockDataLoaded) {
                this.calculateMaterialStockConsumption();
            } else {
                console.warn('⚠️ No stock data available - charts will show all items as sufficient');
            }
            
        } catch (error) {
            console.error('❌ Error loading material stock data:', error);
            // Initialize empty stock data to prevent errors
            this.materialStocks = {};
            this.stockCalculations = {};
        }
    }

    // Enhanced stock consumption calculation with better error handling
    async calculateMaterialStockConsumption() {
        console.log('🧮 Dashboard: Calculating comprehensive material stock consumption...');
        
        // Initialize if not exists
        if (!this.stockCalculations) {
            this.stockCalculations = {};
        }
        
        Object.keys(this.productGroups).forEach(groupKey => {
            const group = this.productGroups[groupKey];
            const stockData = this.materialStocks[groupKey];
            const currentStock = stockData ? (stockData.quantity || 0) : 0;
            
            console.log(`📦 Calculating for ${group.name} with ${currentStock} initial stock`);
            
            if (currentStock <= 0) {
                // No stock available, all items are insufficient
                this.stockCalculations[groupKey] = {
                    currentStock: 0,
                    itemAvailability: {},
                    groupName: group.name,
                    allItemsInsufficient: true
                };
                console.log(`⚠️ No stock for ${group.name} - all items will be insufficient`);
                return;
            }
            
            // Get all items (orders + forecasts) for this group's products
            const allItems = this.getAllItemsForGroup(group.products);
            
            // Sort chronologically by delivery date
            allItems.sort((a, b) => {
                const dateA = this.parseDate(a.date);
                const dateB = this.parseDate(b.date);
                return dateA - dateB;
            });
            
            console.log(`📦 Found ${allItems.length} items for ${group.name}`);
            
            // Calculate running stock consumption
            let runningStock = currentStock;
            const itemAvailability = {};
            
            allItems.forEach(item => {
                const beforeStock = runningStock;
                runningStock -= item.quantity;
                const afterStock = Math.max(0, runningStock);
                
                const sufficient = beforeStock >= item.quantity;
                
                // Create unique key for this item
                let itemKey;
                if (item.type === 'order') {
                    itemKey = `order-${item.id}`;
                } else {
                    itemKey = `forecast-${item.forecastKey}`;
                }
                
                itemAvailability[itemKey] = {
                    ...item,
                    beforeStock,
                    afterStock,
                    sufficient,
                    shortfall: sufficient ? 0 : item.quantity - beforeStock
                };
                
                console.log(`📦 ${group.name}: ${itemKey} - Stock: ${beforeStock} → ${afterStock}, Sufficient: ${sufficient}`);
            });
            
            this.stockCalculations[groupKey] = {
                currentStock,
                itemAvailability,
                finalStock: Math.max(0, runningStock),
                groupName: group.name,
                allItemsInsufficient: false
            };
        });
        
        console.log('✅ Stock calculations completed:', this.stockCalculations);
        
        // Save calculations to localStorage for other pages
        try {
            localStorage.setItem('dashboardStockCalculations', JSON.stringify(this.stockCalculations));
        } catch (error) {
            console.warn('⚠️ Could not save calculations to localStorage:', error);
        }
    }

    // Enhanced method to get all items for a group (used in stock calculations)
    getAllItemsForGroup(products) {
        const items = [];
        
        products.forEach(product => {
            // Add EDI orders (excluding "ok" status as per requirements)
            const orders = this.ediData.filter(order => 
                order.drawing_number === product && 
                (!order.status || order.status.toLowerCase().trim() !== 'ok')
            );
            
            orders.forEach(order => {
                items.push({
                    type: 'order',
                    date: order.delivery_date,
                    quantity: parseInt(order.quantity) || 0,
                    product: product,
                    orderNumber: order.order_number,
                    status: order.status || '',
                    id: order.id,
                    priority: this.getOrderPriority(order.status)
                });
            });
            
            // Add forecast data as future orders
            Object.keys(this.forecastData).forEach(key => {
                if (key.startsWith(product + '-')) {
                    const monthDate = key.split('-').slice(1).join('-');
                    const quantity = this.forecastData[key];
                    
                    if (quantity > 0) {
                        // Convert MM/01 to YYYY/MM/01 format for sorting
                        const parts = monthDate.split('/');
                        const month = parts[0];
                        const currentYear = new Date().getFullYear();
                        const fullDate = `${currentYear}/${month}/01`;
                        
                        items.push({
                            type: 'forecast',
                            date: fullDate,
                            quantity: quantity,
                            product: product,
                            monthDate: monthDate,
                            forecastKey: key,
                            priority: 3
                        });
                    }
                }
            });
        });
        
        return items;
    }

    // Get order priority for stacking (0 = bottom/first, higher = top/last)
    getOrderPriority(status) {
        if (!status || status.trim() === '') {
            return 2; // Blue/no comment (top)
        } else if (status.toLowerCase().trim() === 'ok') {
            return 0; // Green/OK (bottom - highest priority)
        } else {
            return 1; // Yellow/with comments (middle)
        }
    }

    // Enhanced stock sufficiency check with better fallback logic
    isItemStockSufficient(drawingNumber, item) {
        try {
            // Find which group this product belongs to
            let groupKey = null;
            Object.keys(this.productGroups).forEach(key => {
                if (this.productGroups[key].products.includes(drawingNumber)) {
                    groupKey = key;
                }
            });
            
            if (!groupKey) {
                console.warn(`⚠️ Product ${drawingNumber} not found in any group`);
                return true; // Default to sufficient if product not found
            }
            
            const calculations = this.stockCalculations[groupKey];
            if (!calculations) {
                console.warn(`⚠️ No calculations found for group ${groupKey}`);
                return true; // Default to sufficient if no calculations
            }
            
            // If no stock at all, everything is insufficient
            if (calculations.allItemsInsufficient || calculations.currentStock <= 0) {
                return false;
            }
            
            // Create item key based on type
            let itemKey;
            if (item.type === 'order') {
                // Find the order ID from ediData
                const order = this.ediData.find(o => 
                    o.order_number === item.orderNumber && 
                    o.drawing_number === drawingNumber
                );
                if (order) {
                    itemKey = `order-${order.id}`;
                }
            } else if (item.type === 'forecast') {
                itemKey = `forecast-${drawingNumber}-${item.monthDate}`;
            }
            
            if (itemKey && calculations.itemAvailability[itemKey]) {
                const result = calculations.itemAvailability[itemKey].sufficient;
                console.log(`🔍 Stock check for ${itemKey}: ${result ? 'SUFFICIENT' : 'INSUFFICIENT'}`);
                return result;
            }
            
            console.warn(`⚠️ Item key ${itemKey} not found in availability calculations`);
            return true; // Default to sufficient if not found
            
        } catch (error) {
            console.error('❌ Error checking stock sufficiency:', error);
            return true; // Default to sufficient on error
        }
    }

    async importData() {
        if (!this.userPermissions.canEdit) {
            this.showMessage('You do not have permission to import data', 'error');
            return;
        }

        const fileInput = document.getElementById('fileInput');
        const file = fileInput.files[0];
        
        if (!file) {
            this.showMessage('Please select a file first', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('ediFile', file);

        try {
            this.showLoading(true);
            
            const response = await fetch('/api/import-edi', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage(result.message, 'success');
                await this.loadData(); // Reload data after import
                
                // Reset file input
                fileInput.value = '';
                const importBtn = document.getElementById('importBtn');
                if (importBtn) {
                    importBtn.disabled = true;
                    importBtn.textContent = '📤 Import WebEDI Data';
                }
            } else {
                this.showMessage(result.error || 'Import failed', 'error');
            }
        } catch (error) {
            if (error.message.includes('403')) {
                this.showMessage('You do not have permission to import data', 'error');
            } else {
                this.showMessage('Import failed: ' + error.message, 'error');
            }
        } finally {
            this.showLoading(false);
        }
    }

    async saveStatus(orderId) {
        if (!this.userPermissions.canEdit) {
            this.showMessage('You do not have permission to save changes', 'error');
            return;
        }

        const input = document.querySelector(`[data-order-id="${orderId}"]`);
        const status = input.value;

        try {
            const response = await fetch(`/api/edi-data/${orderId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status })
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage('Status updated successfully', 'success');
                
                // Update local data
                const order = this.ediData.find(o => o.id == orderId);
                if (order) {
                    order.status = status;
                }
                
                // Update all product charts to reflect new status colors
                this.updateAllProductCharts();
                
            } else {
                this.showMessage(result.error || 'Failed to update status', 'error');
            }
        } catch (error) {
            if (error.message.includes('403')) {
                this.showMessage('You do not have permission to save changes', 'error');
            } else {
                this.showMessage('Failed to save status: ' + error.message, 'error');
            }
        }
    }

    async saveAllChanges() {
        if (!this.userPermissions.canEdit) {
            this.showMessage('You do not have permission to save changes', 'error');
            return;
        }

        const inputs = document.querySelectorAll('.status-input:not(:disabled)');
        let updated = 0;
        let errors = 0;

        this.showLoading(true);

        for (const input of inputs) {
            const orderId = input.getAttribute('data-order-id');
            const status = input.value;

            try {
                const response = await fetch(`/api/edi-data/${orderId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ status })
                });

                if (response.ok) {
                    updated++;
                    // Update local data
                    const order = this.ediData.find(o => o.id == orderId);
                    if (order) {
                        order.status = status;
                    }
                } else {
                    errors++;
                }
            } catch (error) {
                errors++;
            }
        }

        this.showLoading(false);
        
        if (errors === 0) {
            this.showMessage(`All ${updated} changes saved successfully`, 'success');
        } else {
            this.showMessage(`${updated} saved, ${errors} errors occurred`, 'error');
        }
        
        // Update all product charts to reflect new status colors
        this.updateAllProductCharts();
    }

    // ============ ENHANCED EXPORT FUNCTIONALITY ============
    async exportToCSV() {
        try {
            console.log('📊 Starting CSV export...');
            this.showMessage('Preparing CSV export...', 'info');
            
            const response = await fetch('/api/export/csv', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Export failed: ${response.status}`);
            }
            
            // Get the blob from response
            const blob = await response.blob();
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Generate filename with current date
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
            a.download = `EDI_Orders_${dateStr}.csv`;
            
            // Trigger download
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.showMessage('CSV file downloaded successfully! Opens in Excel.', 'success');
            console.log('✅ CSV export completed');
            
        } catch (error) {
            console.error('❌ CSV export error:', error);
            this.showMessage('Failed to export CSV file: ' + error.message, 'error');
        }
    }

    async exportToJSON() {
        try {
            console.log('📊 Starting JSON export...');
            this.showMessage('Preparing JSON export...', 'info');
            
            const response = await fetch('/api/export/json', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`Export failed: ${response.status}`);
            }
            
            // Get the blob from response
            const blob = await response.blob();
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Generate filename with current date
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
            a.download = `EDI_Orders_${dateStr}.json`;
            
            // Trigger download
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.showMessage('JSON file downloaded successfully!', 'success');
            console.log('✅ JSON export completed');
            
        } catch (error) {
            console.error('❌ JSON export error:', error);
            this.showMessage('Failed to export JSON file: ' + error.message, 'error');
        }
    }

    // ============ ENHANCED CHART METHODS WITH STOCK INTEGRATION ============
    parseDate(dateString) {
        if (!dateString) return null;
        try {
            const [year, month, day] = dateString.split('/');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } catch {
            return null;
        }
    }

    getFutureOrders(orders) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today
        
        return orders.filter(order => {
            const orderDate = this.parseDate(order.delivery_date);
            return orderDate && orderDate >= today;
        });
    }

    groupOrdersByDate(orders) {
        const groups = {};
        
        orders.forEach(order => {
            const date = order.delivery_date;
            if (!groups[date]) {
                groups[date] = {
                    totalQuantity: 0,
                    orders: []
                };
            }
            groups[date].totalQuantity += parseInt(order.quantity) || 0;
            groups[date].orders.push({
                quantity: parseInt(order.quantity) || 0,
                orderNumber: order.order_number,
                status: order.status || '',
                orderId: order.id
            });
        });
        
        // Sort by date
        const sortedDates = Object.keys(groups).sort((a, b) => {
            const dateA = this.parseDate(a);
            const dateB = this.parseDate(b);
            return dateA - dateB;
        });
        
        return sortedDates.map(date => ({
            date: date,
            quantity: groups[date].totalQuantity,
            orders: groups[date].orders
        }));
    }

    getStatusColor(status) {
        if (!status || status.trim() === '') {
            return '#4f46e5'; // Blue - No status
        } else if (status.toLowerCase().trim() === 'ok') {
            return '#059669'; // Green - OK status
        } else {
            return '#f59e0b'; // Yellow - Has comment but not OK
        }
    }

    formatDateShort(dateString) {
        if (!dateString) return '';
        try {
            const [year, month, day] = dateString.split('/');
            return `${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
        } catch {
            return dateString;
        }
    }

    // Enhanced chart rendering with stock integration and proper stacking
    createBarChart(containerId, data, drawingNumber) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Get forecast data for this drawing number
        const forecastBars = this.getForecastBarsForChart(drawingNumber, data);
        
        // Merge and sort forecast and order data chronologically
        const combinedData = this.mergeForecastAndOrderData(data, forecastBars);
        
        if (combinedData.length === 0) {
            container.innerHTML = `
                <div class="no-data-state">
                    <h3>📅 No Future Orders or Forecasts</h3>
                    <p>There are no orders or forecasts with dates from today onwards for this product.</p>
                </div>
            `;
            return;
        }
        
        const width = container.clientWidth - 50;
        const height = 450;
        const margin = { top: 20, right: 30, bottom: 80, left: 60 };
        
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;
        
        // Create SVG
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'chart-svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        
        // Calculate scales
        const maxQuantity = Math.max(...combinedData.map(d => d.quantity));
        
        // Calculate bar positioning
        const totalBars = combinedData.length;
        const barWidth = Math.min(60, chartWidth / totalBars * 0.8);
        const barSpacing = (chartWidth - (barWidth * totalBars)) / (totalBars + 1);
        
        // Draw Y-axis
        const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        yAxis.setAttribute('class', 'chart-axis');
        yAxis.setAttribute('x1', margin.left);
        yAxis.setAttribute('y1', margin.top);
        yAxis.setAttribute('x2', margin.left);
        yAxis.setAttribute('y2', height - margin.bottom);
        svg.appendChild(yAxis);
        
        // Draw X-axis
        const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        xAxis.setAttribute('class', 'chart-axis');
        xAxis.setAttribute('x1', margin.left);
        xAxis.setAttribute('y1', height - margin.bottom);
        xAxis.setAttribute('x2', width - margin.right);
        xAxis.setAttribute('y2', height - margin.bottom);
        svg.appendChild(xAxis);
        
        // Draw bars with enhanced stock-based rendering and proper stacking
        combinedData.forEach((d, i) => {
            const totalBarHeight = (d.quantity / maxQuantity) * chartHeight;
            const x = margin.left + barSpacing + (i * (barWidth + barSpacing));
            const barBottom = height - margin.bottom;
            
            if (d.type === 'order') {
                // Sort orders by priority for proper stacking (OK at bottom, no status at top)
                const sortedOrders = [...d.orders].sort((a, b) => {
                    const aPriority = this.getOrderPriority(a.status);
                    const bPriority = this.getOrderPriority(b.status);
                    return aPriority - bPriority; // Lower priority number = bottom of stack
                });
                
                let cumulativeHeight = 0;
                sortedOrders.forEach((order, orderIndex) => {
                    const segmentHeight = (order.quantity / d.quantity) * totalBarHeight;
                    const segmentY = barBottom - cumulativeHeight - segmentHeight;
                    const statusColor = this.getStatusColor(order.status);
                    
                    // Check if this specific order has sufficient stock
                    const orderItem = {
                        type: 'order',
                        orderNumber: order.orderNumber,
                        date: d.date
                    };
                    const hasStock = this.isItemStockSufficient(drawingNumber, orderItem);
                    
                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('x', x);
                    rect.setAttribute('y', segmentY);
                    rect.setAttribute('width', barWidth);
                    rect.setAttribute('height', segmentHeight);
                    
                    // Apply stock-based styling
                    if (hasStock) {
                        // Sufficient stock: normal filled bar
                        rect.setAttribute('fill', statusColor);
                        rect.setAttribute('opacity', '1');
                        rect.setAttribute('stroke', 'white');
                        rect.setAttribute('stroke-width', '1');
                    } else {
                        // Insufficient stock: transparent with dashed outline
                        rect.setAttribute('fill', 'none');
                        rect.setAttribute('stroke', statusColor);
                        rect.setAttribute('stroke-width', '2');
                        rect.setAttribute('opacity', '0.7');
                        rect.setAttribute('stroke-dasharray', '4,4');
                    }
                    
                    rect.setAttribute('class', 'bar-segment');
                    
                    // Enhanced tooltip with stock information
                    const statusText = order.status ? ` (Status: "${order.status}")` : ' (No status)';
                    const stockText = hasStock ? '' : ' [INSUFFICIENT STOCK]';
                    const priorityText = hasStock ? '' : ' - Material shortage detected';
                    const tooltipText = `${this.formatDateShort(d.date)} - ${order.orderNumber}\nQuantity: ${order.quantity}${statusText}${stockText}${priorityText}`;
                    rect.setAttribute('title', tooltipText);
                    
                    svg.appendChild(rect);
                    
                    // Add separator lines between segments (but make them more visible for insufficient stock)
                    if (orderIndex > 0) {
                        const lineY = barBottom - cumulativeHeight;
                        const separatorLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        separatorLine.setAttribute('x1', x);
                        separatorLine.setAttribute('y1', lineY);
                        separatorLine.setAttribute('x2', x + barWidth);
                        separatorLine.setAttribute('y2', lineY);
                        separatorLine.setAttribute('stroke', hasStock ? 'white' : '#dc2626');
                        separatorLine.setAttribute('stroke-width', hasStock ? '2' : '3');
                        separatorLine.setAttribute('stroke-dasharray', hasStock ? '4,2' : '6,3');
                        separatorLine.setAttribute('opacity', '0.9');
                        svg.appendChild(separatorLine);
                    }
                    
                    cumulativeHeight += segmentHeight;
                });
                
                // Add order count label if multiple orders
                if (d.orders.length > 1) {
                    const hasAnyStock = d.orders.some(order => {
                        const orderItem = { type: 'order', orderNumber: order.orderNumber, date: d.date };
                        return this.isItemStockSufficient(drawingNumber, orderItem);
                    });
                    
                    const countText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    countText.setAttribute('class', 'chart-text');
                    countText.setAttribute('x', x + barWidth / 2);
                    countText.setAttribute('y', barBottom - totalBarHeight - 25);
                    countText.setAttribute('text-anchor', 'middle');
                    countText.setAttribute('font-size', '10');
                    countText.setAttribute('font-weight', 'bold');
                    countText.setAttribute('fill', hasAnyStock ? '#6b7280' : '#dc2626');
                    countText.textContent = `${d.orders.length} orders${hasAnyStock ? '' : ' [!]'}`;
                    svg.appendChild(countText);
                }
            } else {
                // Handle forecast bars
                const forecastItem = {
                    type: 'forecast',
                    monthDate: d.monthDate,
                    date: d.date
                };
                const hasStock = this.isItemStockSufficient(drawingNumber, forecastItem);
                
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', x);
                rect.setAttribute('y', barBottom - totalBarHeight);
                rect.setAttribute('width', barWidth);
                rect.setAttribute('height', totalBarHeight);
                
                // Apply stock-based styling for forecasts
                if (hasStock) {
                    // Sufficient stock: normal forecast styling
                    rect.setAttribute('fill', '#e5e7eb');
                    rect.setAttribute('stroke', '#9ca3af');
                    rect.setAttribute('stroke-width', '1');
                    rect.setAttribute('stroke-dasharray', '3,3');
                    rect.setAttribute('opacity', '1');
                } else {
                    // Insufficient stock: transparent with strong warning outline
                    rect.setAttribute('fill', 'none');
                    rect.setAttribute('stroke', '#dc2626');
                    rect.setAttribute('stroke-width', '3');
                    rect.setAttribute('stroke-dasharray', '6,6');
                    rect.setAttribute('opacity', '0.8');
                }
                
                rect.setAttribute('class', 'bar-segment');
                
                const stockText = hasStock ? '' : ' [INSUFFICIENT STOCK - Material shortage expected]';
                const tooltipText = `Forecast: ${d.displayDate}\nQuantity: ${d.quantity}${stockText}`;
                rect.setAttribute('title', tooltipText);
                svg.appendChild(rect);
                
                // Add forecast label with stock warning
                const forecastLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                forecastLabel.setAttribute('class', 'chart-text');
                forecastLabel.setAttribute('x', x + barWidth / 2);
                forecastLabel.setAttribute('y', barBottom - totalBarHeight - 25);
                forecastLabel.setAttribute('text-anchor', 'middle');
                forecastLabel.setAttribute('font-size', '11');
                forecastLabel.setAttribute('fill', hasStock ? '#6b7280' : '#dc2626');
                forecastLabel.setAttribute('font-weight', 'bold');
                forecastLabel.textContent = hasStock ? 'Forecast' : 'F - No Stock!';
                svg.appendChild(forecastLabel);
            }
            
            // Add quantity label on top of bar with stock warning
            const hasAnyStock = d.type === 'order' ? 
                d.orders.some(order => {
                    const orderItem = { type: 'order', orderNumber: order.orderNumber, date: d.date };
                    return this.isItemStockSufficient(drawingNumber, orderItem);
                }) : 
                this.isItemStockSufficient(drawingNumber, { type: 'forecast', monthDate: d.monthDate });
            
            const quantityText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            quantityText.setAttribute('class', 'chart-text');
            quantityText.setAttribute('x', x + barWidth / 2);
            quantityText.setAttribute('y', barBottom - totalBarHeight - 8);
            quantityText.setAttribute('text-anchor', 'middle');
            quantityText.setAttribute('font-weight', 'bold');
            quantityText.setAttribute('font-size', hasAnyStock ? '12' : '11');
            quantityText.setAttribute('fill', hasAnyStock ? '#1f2937' : '#dc2626');
            quantityText.textContent = hasAnyStock ? d.quantity : `${d.quantity}⚠️`;
            svg.appendChild(quantityText);
            
            // Add date label below X-axis
            const dateText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            dateText.setAttribute('class', 'chart-label');
            dateText.setAttribute('x', x + barWidth / 2);
            dateText.setAttribute('y', height - margin.bottom + 25);
            dateText.setAttribute('text-anchor', 'middle');
            dateText.setAttribute('font-size', '11');
            dateText.setAttribute('font-weight', '500');
            dateText.setAttribute('fill', hasAnyStock ? '#000000' : '#dc2626');
            dateText.textContent = d.displayDate;
            svg.appendChild(dateText);
            
            // Add type/stock status label on second line
            const typeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            typeText.setAttribute('class', 'chart-label');
            typeText.setAttribute('x', x + barWidth / 2);
            typeText.setAttribute('y', height - margin.bottom + 40);
            typeText.setAttribute('text-anchor', 'middle');
            typeText.setAttribute('font-size', '9');
            typeText.setAttribute('fill', hasAnyStock ? '#9ca3af' : '#dc2626');
            typeText.textContent = hasAnyStock ? 
                (d.type === 'forecast' ? 'Forecast' : d.date.split('/')[0]) : 
                'No Stock';
            svg.appendChild(typeText);
        });
        
        // Add Y-axis labels and grid lines
        const yLabelCount = 6;
        for (let i = 0; i <= yLabelCount; i++) {
            const value = Math.round((maxQuantity / yLabelCount) * i);
            const y = height - margin.bottom - (chartHeight / yLabelCount) * i;
            
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('class', 'chart-text');
            label.setAttribute('x', margin.left - 10);
            label.setAttribute('y', y + 3);
            label.setAttribute('text-anchor', 'end');
            label.setAttribute('font-size', '11');
            label.textContent = value;
            svg.appendChild(label);
            
            if (i > 0) {
                const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                gridLine.setAttribute('x1', margin.left);
                gridLine.setAttribute('y1', y);
                gridLine.setAttribute('x2', width - margin.right);
                gridLine.setAttribute('y2', y);
                gridLine.setAttribute('stroke', '#f3f4f6');
                gridLine.setAttribute('stroke-width', '1');
                svg.appendChild(gridLine);
            }
        }
        
        // Enhanced legend with stock integration info
        const legendY = margin.top;
        const legendItems = [
            { color: '#059669', label: 'OK Status', priority: 'Bottom' },
            { color: '#f59e0b', label: 'With Comments', priority: 'Middle' },
            { color: '#4f46e5', label: 'No Status', priority: 'Top' },
            { color: '#e5e7eb', label: 'Forecast', dashed: true },
            { color: '#dc2626', label: 'No Stock', outline: true, warning: true }
        ];
        
        legendItems.forEach((item, index) => {
            const legendX = width - margin.right - 300 + (index * 60);
            
            const legendRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            legendRect.setAttribute('x', legendX);
            legendRect.setAttribute('y', legendY);
            legendRect.setAttribute('width', '12');
            legendRect.setAttribute('height', '12');
            
            if (item.outline) {
                legendRect.setAttribute('fill', 'none');
                legendRect.setAttribute('stroke', item.color);
                legendRect.setAttribute('stroke-width', item.warning ? '3' : '2');
                legendRect.setAttribute('stroke-dasharray', item.warning ? '3,3' : '2,2');
            } else {
                legendRect.setAttribute('fill', item.color);
                legendRect.setAttribute('stroke', item.dashed ? '#9ca3af' : '#ffffff');
                legendRect.setAttribute('stroke-width', '1');
                if (item.dashed) {
                    legendRect.setAttribute('stroke-dasharray', '2,2');
                }
            }
            svg.appendChild(legendRect);
            
            const legendText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            legendText.setAttribute('x', legendX + 16);
            legendText.setAttribute('y', legendY + 9);
            legendText.setAttribute('font-size', '7');
            legendText.setAttribute('font-weight', item.warning ? 'bold' : 'normal');
            legendText.setAttribute('fill', item.warning ? '#dc2626' : '#6b7280');
            legendText.textContent = item.label;
            svg.appendChild(legendText);
        });
        
        // Add comprehensive chart title
        const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        titleText.setAttribute('x', width / 2);
        titleText.setAttribute('y', height - 5);
        titleText.setAttribute('text-anchor', 'middle');
        titleText.setAttribute('font-size', '10');
        titleText.setAttribute('fill', '#6b7280');
        titleText.textContent = 'Delivery Schedule with Material Stock Analysis & Priority Stacking (OK→Comments→No Status)';
        svg.appendChild(titleText);
        
        container.innerHTML = '';
        container.appendChild(svg);
    }

    // Merge forecast and order data chronologically
    mergeForecastAndOrderData(orderData, forecastBars) {
        const combined = [];
        
        // Add order data
        orderData.forEach(order => {
            combined.push({
                type: 'order',
                date: order.date,
                displayDate: this.formatDateShort(order.date),
                quantity: order.quantity,
                orders: order.orders,
                sortDate: this.parseDate(order.date)
            });
        });
        
        // Add forecast data
        forecastBars.forEach(forecast => {
            combined.push({
                type: 'forecast',
                date: forecast.fullDate,
                displayDate: forecast.displayDate,
                quantity: forecast.quantity,
                monthDate: forecast.monthDate, // Add monthDate for stock calculations
                sortDate: this.parseDate(forecast.fullDate)
            });
        });
        
        // Sort chronologically
        combined.sort((a, b) => {
            const dateA = a.sortDate || new Date('9999-12-31');
            const dateB = b.sortDate || new Date('9999-12-31');
            return dateA - dateB;
        });
        
        console.log(`📊 Merged data for chart: ${combined.length} items (${orderData.length} orders + ${forecastBars.length} forecasts)`);
        return combined;
    }

    // Get forecast bars for chart with better date matching and type conversion
    getForecastBarsForChart(drawingNumber, existingData) {
        console.log(`📊 Getting forecast bars for ${drawingNumber}`);
        console.log(`📊 Available forecast data keys:`, Object.keys(this.forecastData));
        console.log(`📊 Available forecast data:`, this.forecastData);
        
        const forecastBars = [];
        const now = new Date();
        
        // Get existing delivery dates to avoid overlap
        const existingDates = new Set(existingData.map(d => d.date));
        console.log(`📊 Existing delivery dates:`, Array.from(existingDates));
        
        // Generate 6 months from current month with consistent formatting
        for (let i = 0; i < 6; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const month = date.getMonth() + 1;
            const year = date.getFullYear();
            
            // Use consistent MM/01 format (matching forecast.html saving format)
            const monthKey = `${String(month).padStart(2, '0')}/01`;
            const forecastKey = `${drawingNumber}-${monthKey}`;
            
            console.log(`📊 Checking forecast key: ${forecastKey}`);
            
            // Enhanced type checking and conversion
            let forecastValue = this.forecastData[forecastKey];
            
            // Handle both string and number values, convert to number
            if (forecastValue !== undefined && forecastValue !== null && forecastValue !== '') {
                forecastValue = typeof forecastValue === 'string' ? parseFloat(forecastValue) : forecastValue;
                console.log(`📊 Forecast value for ${forecastKey}: ${forecastValue} (type: ${typeof forecastValue})`);
            } else {
                console.log(`📊 No forecast value for ${forecastKey} (value: ${forecastValue})`);
                continue;
            }
            
            // Only add if value is a positive number
            if (!isNaN(forecastValue) && forecastValue > 0) {
                // Format display date
                const displayDate = `${String(month).padStart(2, '0')}/01`;
                
                // Only add if not overlapping with existing delivery dates
                const fullDate = `${year}/${String(month).padStart(2, '0')}/01`;
                if (!existingDates.has(fullDate)) {
                    const forecastBar = {
                        quantity: forecastValue,
                        displayDate: displayDate,
                        fullDate: fullDate,
                        monthDate: monthKey, // Keep monthDate for stock calculations
                        month: month,
                        year: year
                    };
                    forecastBars.push(forecastBar);
                    console.log(`✅ Added forecast bar:`, forecastBar);
                } else {
                    console.log(`⚠️ Skipping forecast ${fullDate} - overlaps with existing delivery`);
                }
            } else {
                console.log(`⚠️ Invalid forecast data for ${forecastKey}: value=${forecastValue}, isNaN=${isNaN(forecastValue)}`);
            }
        }
        
        console.log(`📊 Final forecast bars for ${drawingNumber}:`, forecastBars);
        console.log(`📊 Total forecast bars: ${forecastBars.length}`);
        return forecastBars;
    }

    generateProductChart(drawingNumber) {
        const productOrders = this.ediData.filter(order => order.drawing_number === drawingNumber);
        const futureOrders = this.getFutureOrders(productOrders);
        const chartData = this.groupOrdersByDate(futureOrders);
        
        this.createBarChart(`chart-${drawingNumber}`, chartData, drawingNumber);
        
        // Update stats
        const totalQuantity = futureOrders.reduce((sum, order) => sum + (parseInt(order.quantity) || 0), 0);
        const totalOrders = futureOrders.length;
        const nextDelivery = futureOrders.length > 0 ? futureOrders[0].delivery_date : 'None';
        
        const totalQuantityEl = document.getElementById(`total-quantity-${drawingNumber}`);
        const totalOrdersEl = document.getElementById(`total-orders-${drawingNumber}`);
        const nextDeliveryEl = document.getElementById(`next-delivery-${drawingNumber}`);
        
        if (totalQuantityEl) totalQuantityEl.textContent = totalQuantity;
        if (totalOrdersEl) totalOrdersEl.textContent = totalOrders;
        if (nextDeliveryEl) nextDeliveryEl.textContent = nextDelivery;
    }

    updateAllProductCharts() {
        this.DRAWING_NUMBER_ORDER.forEach(drawingNumber => {
            this.generateProductChart(drawingNumber);
        });
    }

    // ============ VERIFICATION AND DEBUGGING METHODS ============
    
    verifyForecastDataIntegrity() {
        console.log('🔍 Verifying forecast data integrity...');
        
        const now = new Date();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentKey = `${currentMonth}/01`;
        
        console.log(`🔍 Current month key format: ${currentKey}`);
        
        let foundDataCount = 0;
        this.DRAWING_NUMBER_ORDER.forEach(product => {
            const testKey = `${product}-${currentKey}`;
            const hasData = this.forecastData.hasOwnProperty(testKey);
            const value = this.forecastData[testKey];
            
            console.log(`🔍 Testing ${testKey}: ${hasData ? 'EXISTS' : 'MISSING'} (value: ${value})`);
            if (hasData && value > 0) {
                foundDataCount++;
            }
        });
        
        console.log(`🔍 Found ${foundDataCount} forecast entries for current month`);
        
        if (foundDataCount === 0) {
            console.warn('⚠️ No forecast data found for current month. Check date format consistency.');
            this.debugForecastDateFormats();
        }
    }

    debugForecastDateFormats() {
        console.log('🔍 DEBUGGING FORECAST DATE FORMATS:');
        
        // Show all available keys and their formats
        Object.keys(this.forecastData).forEach(key => {
            const parts = key.split('-');
            const drawingNumber = parts[0];
            const dateKey = parts.slice(1).join('-');
            console.log(`🔍 Key: ${key} | Drawing: ${drawingNumber} | Date: ${dateKey} | Value: ${this.forecastData[key]}`);
        });
        
        // Show expected format for current month
        const now = new Date();
        const expectedFormat = `${String(now.getMonth() + 1).padStart(2, '0')}/01`;
        console.log(`🔍 Expected current month format: ${expectedFormat}`);
        
        // Test format variations
        const testFormats = [
            `${now.getMonth() + 1}/01`,
            `${String(now.getMonth() + 1).padStart(2, '0')}/01`,
            `${String(now.getMonth() + 1).padStart(2, '0')}/1`,
            `${now.getMonth() + 1}/1`
        ];
        
        console.log('🔍 Testing format variations for first product:');
        const testProduct = this.DRAWING_NUMBER_ORDER[0];
        testFormats.forEach(format => {
            const testKey = `${testProduct}-${format}`;
            const exists = this.forecastData.hasOwnProperty(testKey);
            console.log(`🔍 Format ${format}: ${testKey} ${exists ? 'EXISTS' : 'MISSING'}`);
        });
    }

    // Cross-window communication
    notifyOtherWindows(messageType) {
        try {
            // Use localStorage to communicate with other tabs/windows
            const message = {
                type: messageType,
                timestamp: Date.now(),
                source: 'dashboard'
            };
            localStorage.setItem('crossWindowMessage', JSON.stringify(message));
            
            // Clean up immediately
            setTimeout(() => {
                localStorage.removeItem('crossWindowMessage');
            }, 1000);
            
        } catch (error) {
            console.warn('Could not send cross-window message:', error);
        }
    }

    // Listen for cross-window messages
    setupCrossWindowCommunication() {
        window.addEventListener('storage', (event) => {
            if (event.key === 'crossWindowMessage' && event.newValue) {
                try {
                    const message = JSON.parse(event.newValue);
                    console.log('📡 Received cross-window message:', message);
                    
                    if (message.source !== 'dashboard') {
                        // Reload data if updated from another window
                        if (message.type === 'STOCK_UPDATED' || message.type === 'FORECAST_UPDATED') {
                            console.log('🔄 Reloading data due to external update');
                            this.loadData();
                        }
                    }
                } catch (error) {
                    console.warn('Could not parse cross-window message:', error);
                }
            }
        });
    }

    // Debug method for stock integration
    debugStockIntegration() {
        console.log('🔍 STOCK INTEGRATION DEBUG:');
        console.log('📦 Material Stocks:', this.materialStocks);
        console.log('📊 Stock Calculations:', this.stockCalculations);
        
        // Test each product group
        Object.keys(this.productGroups).forEach(groupKey => {
            const group = this.productGroups[groupKey];
            console.log(`\n🔍 Group: ${group.name} (${groupKey})`);
            
            const stockData = this.materialStocks[groupKey];
            const calculations = this.stockCalculations[groupKey];
            
            console.log(`   Stock Data:`, stockData);
            console.log(`   Calculations:`, calculations);
            
            if (calculations && calculations.itemAvailability) {
                console.log(`   Item Availability:`);
                Object.keys(calculations.itemAvailability).forEach(itemKey => {
                    const item = calculations.itemAvailability[itemKey];
                    console.log(`     ${itemKey}: ${item.sufficient ? 'SUFFICIENT' : 'INSUFFICIENT'} (${item.quantity} units)`);
                });
            }
        });
    }

    debugForecastData() {
        console.log('🔍 DASHBOARD FORECAST DEBUG INFORMATION:');
        console.log('📊 Current forecast data object:', this.forecastData);
        console.log('📊 Number of forecast entries:', Object.keys(this.forecastData).length);
        
        // Show all forecast keys with values and types
        Object.keys(this.forecastData).forEach(key => {
            const value = this.forecastData[key];
            console.log(`🔍 Forecast entry: ${key} = ${value} (type: ${typeof value}, valid: ${!isNaN(parseFloat(value)) && parseFloat(value) > 0})`);
        });
        
        // Generate expected keys for comparison
        const now = new Date();
        
        console.log('🔍 Expected forecast keys for next 6 months:');
        for (let i = 0; i < 6; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const monthKey = `${String(date.getMonth() + 1).padStart(2, '0')}/01`;
            
            this.DRAWING_NUMBER_ORDER.forEach(product => {
                const expectedKey = `${product}-${monthKey}`;
                const hasData = this.forecastData.hasOwnProperty(expectedKey);
                const value = this.forecastData[expectedKey] || 0;
                const isValid = !isNaN(parseFloat(value)) && parseFloat(value) > 0;
                console.log(`🔍 ${expectedKey}: ${hasData ? (isValid ? 'VALID' : 'INVALID') : 'MISSING'} (value: ${value})`);
            });
        }
        
        // Test chart generation for first product
        console.log('🔍 Testing forecast bar generation for first product...');
        if (this.DRAWING_NUMBER_ORDER.length > 0) {
            const testProduct = this.DRAWING_NUMBER_ORDER[0];
            const testData = this.ediData.filter(order => order.drawing_number === testProduct);
            const testFutureOrders = this.getFutureOrders(testData);
            const testChartData = this.groupOrdersByDate(testFutureOrders);
            const testForecastBars = this.getForecastBarsForChart(testProduct, testChartData);
            console.log(`🔍 Generated ${testForecastBars.length} forecast bars for ${testProduct}`);
        }
    }

    // ============ UI METHODS ============
    showLoading(show) {
        const loading = document.getElementById('loadingIndicator');
        if (loading) {
            loading.style.display = show ? 'block' : 'none';
        }
    }

    showMessage(message, type) {
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

    showMainDashboard() {
        this.currentView = 'main';
        
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

    showProductPage(drawingNumber) {
        this.currentView = drawingNumber;
        
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
        this.generateProductChart(drawingNumber);
    }

    renderTable() {
        const container = document.getElementById('dataContainer');
        const recordCount = document.getElementById('recordCount');
        
        if (recordCount) {
            recordCount.textContent = `${this.ediData.length} records`;
        }

        if (!container) return;

        if (this.ediData.length === 0) {
            const emptyMessage = this.userPermissions.canEdit ? 
                'Import an EDI file to get started.' : 
                'No EDI data available. Contact admin to import data.';
            
            const steps = this.userPermissions.canEdit ? `
                <div class="steps">
                    <h4>Get started in 2 simple steps:</h4>
                    <div class="step">
                        <div class="step-number">1</div>
                        <span>Click "📁 Choose EDI File" to upload your data</span>
                    </div>
                    <div class="step">
                        <div class="step-number">2</div>
                        <span>Click "Import WebEDI Data" to load orders</span>
                    </div>
                </div>
            ` : '';

            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📊</div>
                    <h3>No EDI Data Loaded</h3>
                    <p>${emptyMessage}</p>
                    ${steps}
                </div>
            `;
            return;
        }

        const tableHTML = `
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>注文番号<br><small>Order Number</small></th>
                            <th>図番<br><small>Drawing Number</small></th>
                            <th>品名<br><small>Product Name</small></th>
                            <th>注文数量<br><small>Quantity</small></th>
                            <th>納期<br><small>Delivery Date</small></th>
                            <th>Status<br><small>Comments</small></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.ediData.map(order => `
                            <tr>
                                <td><strong>${order.order_number || ''}</strong></td>
                                <td><strong>${order.drawing_number || ''}</strong></td>
                                <td>${order.product_name || ''}</td>
                                <td>${order.quantity || ''}</td>
                                <td>${order.delivery_date || ''}</td>
                                <td>
                                    <input type="text" class="status-input" 
                                           value="${order.status || ''}" 
                                           data-order-id="${order.id}"
                                           placeholder="${this.userPermissions.canEdit ? 'Add comments...' : 'Read only'}"
                                           ${!this.userPermissions.canEdit ? 'disabled' : ''}>
                                    ${this.userPermissions.canEdit ? `<button class="save-btn" onclick="ediDashboard.saveStatus(${order.id})">Save</button>` : ''}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = tableHTML;
    }

    // ============ INITIALIZATION ============
    initializeFileHandlers() {
        const fileInput = document.getElementById('fileInput');
        const importBtn = document.getElementById('importBtn');

        if (fileInput && importBtn) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                
                if (file && this.userPermissions.canEdit) {
                    importBtn.disabled = false;
                    importBtn.textContent = `📤 Import ${file.name}`;
                    this.showMessage(`File selected: ${file.name}`, 'success');
                } else {
                    importBtn.disabled = true;
                    importBtn.textContent = '📤 Import WebEDI Data';
                }
            });
        }
    }

    initializeButtonHandlers() {
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
            importBtn.onclick = () => this.importData();
        }

        // Save all button
        const saveAllBtn = document.getElementById('saveAllBtn');
        if (saveAllBtn) {
            saveAllBtn.onclick = () => this.saveAllChanges();
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.onclick = () => this.loadData();
        }

        // Logout button
        const logoutBtns = document.querySelectorAll('.btn-logout');
        logoutBtns.forEach(btn => {
            btn.onclick = () => this.logout();
        });

        // Tab navigation buttons
        const tabButtons = document.querySelectorAll('.tab-btn[data-drawing]');
        tabButtons.forEach(btn => {
            const drawingNumber = btn.getAttribute('data-drawing');
            if (drawingNumber) {
                btn.onclick = () => this.showProductPage(drawingNumber);
            }
        });

        // Main dashboard tab button
        const mainTabBtn = document.querySelector('.tab-btn:not([data-drawing])');
        if (mainTabBtn) {
            mainTabBtn.onclick = () => this.showMainDashboard();
        }
    }

    async initialize() {
        try {
            console.log('🚀 Initializing Enhanced EDI Dashboard...');
            
            // Load user authentication info
            await this.loadUserInfo();
            
            // Load EDI data with stock integration
            await this.loadData();
            
            // Initialize file and button handlers
            this.initializeFileHandlers();
            this.initializeButtonHandlers();
            
            // Setup cross-window communication
            this.setupCrossWindowCommunication();
            
            // Set up auto-refresh every 5 minutes
            setInterval(() => {
                this.loadData();
            }, 300000);
            
            console.log('✅ Enhanced Dashboard initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize dashboard:', error);
            this.showMessage('Failed to initialize dashboard', 'error');
        }
    }
}

// Create global instance
const ediDashboard = new EDIDashboard();

// Global functions for backward compatibility
function showMainDashboard() {
    ediDashboard.showMainDashboard();
}

function showProductPage(drawingNumber) {
    ediDashboard.showProductPage(drawingNumber);
}

function logout() {
    ediDashboard.logout();
}

// ============ GLOBAL EXPORT FUNCTIONS ============
window.exportToCSV = function() {
    if (window.ediDashboard) {
        window.ediDashboard.exportToCSV();
    } else {
        console.error('❌ EDI Dashboard not found');
        alert('Export functionality not available');
    }
};

window.exportToJSON = function() {
    if (window.ediDashboard) {
        window.ediDashboard.exportToJSON();
    } else {
        console.error('❌ EDI Dashboard not found');
        alert('Export functionality not available');
    }
};

// Enhanced debug testing functions
window.testForecastDebug = function() {
    console.log('🧪 Running forecast debug test...');
    ediDashboard.debugForecastData();
};

window.testForecastIntegrity = function() {
    console.log('🧪 Running forecast integrity test...');
    ediDashboard.verifyForecastDataIntegrity();
};

window.testForceRefreshCharts = function() {
    console.log('🧪 Force refreshing all charts...');
    ediDashboard.updateAllProductCharts();
};

window.testForecastAPI = async function() {
    console.log('🧪 Testing forecast API directly...');
    try {
        const response = await fetch('/api/forecasts');
        const data = await response.json();
        console.log('📊 Raw API response:', data);
        return data;
    } catch (error) {
        console.error('❌ API test failed:', error);
        return null;
    }
};

window.testSessionDebug = async function() {
    try {
        const response = await fetch('/api/user-info');
        const data = await response.json();
        console.log('🔍 Session debug - User info:', data);
        return data;
    } catch (error) {
        console.log('❌ Session debug failed:', error);
        return null;
    }
};

window.testStockIntegration = function() {
    console.log('🧪 Testing stock integration...');
    ediDashboard.debugStockIntegration();
};

// Make dashboard available globally
window.ediDashboard = ediDashboard;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    ediDashboard.initialize();
});