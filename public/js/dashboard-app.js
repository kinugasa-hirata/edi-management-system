// dashboard-app.js - FIXED: Enhanced EDI Dashboard with improved session management and stock visualization

class EDIDashboard {
    constructor() {
        this.ediData = [];
        this.forecastData = {};
        this.materialStocks = {}; // Material stock data
        this.stockCalculations = {}; // Stock consumption calculations
        this.currentView = 'main';
        this.userPermissions = { canEdit: false, canView: true };
        this.currentUser = null;
        this.authUtils = window.authUtils; // Use the enhanced auth utils
        
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
            'PP4166-4731P002': 'ﾐﾄﾞﾙﾌﾚｰﾑ A',
            'PP4166-7106P001': 'ﾐﾄﾞﾙﾌﾚｰﾑ B',
            'PP4166-7106P003': 'ﾐﾄﾞﾙﾌﾚｰﾑ B'
        };

        // FIXED: Updated product group mappings - Split middle frame into two separate groups
        this.productGroups = {
            'upper-frame': {
                name: 'ｱｯﾊﾟﾌﾞﾚｰﾑ',
                products: ['PP4166-4681P003', 'PP4166-4681P004']
            },
            'top-plate': {
                name: 'ﾄｯﾌﾟﾌﾟﾚｰﾄ',
                products: ['PP4166-4726P003', 'PP4166-4726P004']
            },
            'middle-frame-a': {
                name: 'ﾐﾄﾞﾙﾌﾚｰﾑ A',
                products: ['PP4166-4731P002']
            },
            'middle-frame-b': {
                name: 'ﾐﾄﾞﾙﾌﾚｰﾑ B',
                products: ['PP4166-7106P001', 'PP4166-7106P003']
            }
        };
    }

    // ============ FIXED AUTHENTICATION METHODS ============
    async loadUserInfo() {
        try {
            console.log('🔍 FIXED: Loading user info via auth utils...');
            
            // Use the enhanced auth utils for better session management
            const userInfo = await this.authUtils.checkAuthentication();
            
            if (userInfo) {
                this.currentUser = userInfo;
                this.userPermissions = userInfo.permissions;
                
                // Update UI based on permissions
                this.updateUIForPermissions();
                
                // Update user display
                this.updateUserDisplay(userInfo);
                
                console.log('✅ FIXED: User info loaded successfully');
                return userInfo;
            } else {
                console.log('❌ FIXED: No valid session found');
                // Auth utils will handle redirect
                return null;
            }
        } catch (error) {
            console.error('❌ FIXED: Error loading user info:', error);
            this.showMessage('Session error. Please log in again.', 'error');
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
            
            // Show login history button for admin users  
            const loginHistoryBtn = document.getElementById('loginHistoryBtn');
            if (loginHistoryBtn) {
                loginHistoryBtn.style.display = 'inline-flex';
            }
        }
    }

    async logout() {
        try {
            console.log('🚪 FIXED: Logout initiated via auth utils...');
            const result = await this.authUtils.logout();
            if (result.success) {
                this.authUtils.triggerCrossTabLogout();
            }
        } catch (error) {
            console.error('❌ FIXED: Logout error:', error);
            // Force redirect even if logout fails
            this.authUtils.redirectToLogin();
        }
    }

    // ============ FIXED DATA MANAGEMENT METHODS ============
    async loadData() {
        try {
            this.showLoading(true);
            console.log('📊 FIXED: Loading EDI data with auth check...');
            
            // FIXED: Use authenticated request method
            const response = await this.authUtils.makeAuthenticatedRequest('/api/edi-data');
            
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
            
            console.log('✅ FIXED: Data loaded successfully');
            
        } catch (error) {
            console.error('❌ FIXED: Error loading data:', error);
            
            if (error.message.includes('Authentication required') || error.message.includes('Session expired')) {
                this.showMessage('Session expired. Please log in again.', 'error');
                // Auth utils will handle redirect
            } else {
                this.showMessage('Failed to load data: ' + error.message, 'error');
            }
        } finally {
            this.showLoading(false);
        }
    }

    // Enhanced forecast data loading with better debugging and type conversion
    async loadForecastData() {
        try {
            console.log('📈 FIXED: Dashboard - Starting forecast data load with auth...');
            
            // FIXED: Use authenticated request
            const response = await this.authUtils.makeAuthenticatedRequest('/api/forecasts');
            
            if (response.ok) {
                const forecasts = await response.json();
                console.log('📈 FIXED: Raw forecast data from API:', forecasts);
                console.log('📈 FIXED: Forecast count:', forecasts.length);
                
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
                    console.log(`📈 FIXED: Loaded forecast ${index + 1}: ${key} = ${quantity} (original: ${forecast.quantity}, type: ${typeof quantity})`);
                });
                
                console.log('📈 FIXED: Processed forecast data keys:', Object.keys(this.forecastData));
                console.log('📈 FIXED: Processed forecast data values:', this.forecastData);
                console.log('📈 FIXED: Total forecast entries:', Object.keys(this.forecastData).length);
                console.log('✅ FIXED: Forecast data loaded successfully');
                
                // Immediate verification - check if we have data for current products
                this.verifyForecastDataIntegrity();
                
            } else {
                console.warn('⚠️ FIXED: Failed to load forecast data:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('❌ FIXED: Error loading forecast data:', error);
            // Don't show error message as forecast is optional
        }
    }

    // Enhanced material stock data loading with localStorage fallback
    async loadMaterialStockData() {
        try {
            console.log('📦 FIXED: Dashboard - Loading material stock data with auth...');
            
            let stockDataLoaded = false;
            
            // Try to load from API first using authenticated request
            try {
                const response = await this.authUtils.makeAuthenticatedRequest('/api/material-stocks');
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
                    console.log('📦 FIXED: Loaded stock data from API:', this.materialStocks);
                    stockDataLoaded = true;
                }
            } catch (apiError) {
                console.warn('⚠️ FIXED: API load failed, trying localStorage:', apiError);
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
                        console.log('📦 FIXED: Loaded stock data from localStorage:', this.materialStocks);
                        stockDataLoaded = true;
                    }
                } catch (localError) {
                    console.error('❌ FIXED: localStorage load also failed:', localError);
                }
            }
            
            // Load detailed calculations from localStorage if available
            try {
                const savedCalculations = localStorage.getItem('stockCalculations');
                if (savedCalculations) {
                    this.stockCalculations = JSON.parse(savedCalculations);
                    console.log('📦 FIXED: Loaded detailed stock calculations from localStorage');
                }
            } catch (calcError) {
                console.warn('⚠️ FIXED: Could not load stock calculations:', calcError);
            }
            
            // Calculate stock consumption after loading
            if (stockDataLoaded) {
                this.calculateMaterialStockConsumption();
            } else {
                console.warn('⚠️ FIXED: No stock data available - charts will show all items as sufficient');
            }
            
        } catch (error) {
            console.error('❌ FIXED: Error loading material stock data:', error);
            // Initialize empty stock data to prevent errors
            this.materialStocks = {};
            this.stockCalculations = {};
        }
    }

    // ✅ FIXED: Enhanced stock consumption calculation with proper forecast inclusion
    async calculateMaterialStockConsumption() {
        console.log('🧮 FIXED: Starting comprehensive stock consumption calculation with forecasts...');
        
        // Initialize if not exists
        if (!this.stockCalculations) {
            this.stockCalculations = {};
        }
        
        Object.keys(this.productGroups).forEach(groupKey => {
            const group = this.productGroups[groupKey];
            const stockData = this.materialStocks[groupKey];
            const currentStock = stockData ? (stockData.quantity || 0) : 0;
            
            console.log(`\n📦 FIXED: Calculating for ${group.name} with ${currentStock} initial stock`);
            
            if (currentStock <= 0) {
                // No stock available, all items are insufficient
                this.stockCalculations[groupKey] = {
                    currentStock: 0,
                    itemAvailability: {},
                    groupName: group.name,
                    allItemsInsufficient: true
                };
                console.log(`⚠️ FIXED: No stock for ${group.name} - all items will be insufficient`);
                return;
            }
            
            // ✅ FIXED: Get all items (orders + forecasts) for this group
            const allItems = this.getAllItemsForGroupFixed(group.products);
            
            if (allItems.length === 0) {
                console.log(`ℹ️ FIXED: No items found for ${group.name}`);
                this.stockCalculations[groupKey] = {
                    currentStock,
                    itemAvailability: {},
                    groupName: group.name,
                    allItemsInsufficient: false
                };
                return;
            }
            
            console.log(`📊 FIXED: Processing ${allItems.length} items for ${group.name}`);
            
            // ✅ Calculate running stock consumption with detailed tracking
            let runningStock = currentStock;
            const itemAvailability = {};
            
            allItems.forEach((item, index) => {
                const beforeStock = runningStock;
                runningStock -= item.quantity;
                const afterStock = Math.max(0, runningStock);
                
                const sufficient = beforeStock >= item.quantity;
                
                // ✅ FIXED: Create unique key for this item with consistent format
                let itemKey;
                if (item.type === 'order') {
                    itemKey = `order-${item.id}`;
                } else if (item.type === 'forecast') {
                    // ✅ CRITICAL: Use exact same format as in chart rendering
                    itemKey = `forecast-${item.product}-${item.monthDate}`;
                }
                
                if (itemKey) {
                    itemAvailability[itemKey] = {
                        ...item,
                        beforeStock,
                        afterStock,
                        sufficient,
                        shortfall: sufficient ? 0 : item.quantity - beforeStock
                    };
                    
                    const typeIcon = item.type === 'order' ? '📋' : '📈';
                    const statusIcon = sufficient ? '✅' : '❌';
                    console.log(`📊 FIXED: ${typeIcon} ${itemKey}: ${beforeStock} → ${afterStock} ${statusIcon}`);
                } else {
                    console.log(`❌ FIXED: Could not create key for item:`, item);
                }
            });
            
            this.stockCalculations[groupKey] = {
                currentStock,
                itemAvailability,
                finalStock: Math.max(0, runningStock),
                groupName: group.name,
                allItemsInsufficient: false
            };
            
            console.log(`✅ FIXED: ${group.name} calculation complete:`);
            console.log(`   Initial stock: ${currentStock}`);
            console.log(`   Final stock: ${Math.max(0, runningStock)}`);
            console.log(`   Items processed: ${Object.keys(itemAvailability).length}`);
        });
        
        console.log('✅ FIXED: All stock calculations completed:', this.stockCalculations);
        
        // Save calculations to localStorage for other pages
        try {
            localStorage.setItem('dashboardStockCalculations', JSON.stringify(this.stockCalculations));
            console.log('💾 FIXED: Stock calculations saved to localStorage');
        } catch (error) {
            console.warn('⚠️ FIXED: Could not save calculations to localStorage:', error);
        }
    }

    // ✅ FIXED: Enhanced method to get all items for a group with better forecast inclusion
    getAllItemsForGroupFixed(products) {
        const items = [];
        
        console.log(`🔍 FIXED: Getting all items for products:`, products);
        
        products.forEach(product => {
            console.log(`\n📦 FIXED: Processing product ${product}...`);
            
            // ✅ CRITICAL: Add EDI orders - exclude "ok" status as they don't need stock
            const allOrders = this.ediData.filter(order => order.drawing_number === product);
            const nonOkOrders = allOrders.filter(order => 
                !order.status || order.status.toLowerCase().trim() !== 'ok'
            );
            const okOrders = allOrders.filter(order => 
                order.status && order.status.toLowerCase().trim() === 'ok'
            );
            
            console.log(`📊 FIXED: Found ${allOrders.length} total orders for ${product}`);
            console.log(`   ✅ OK orders (excluded from stock calc): ${okOrders.length}`);
            console.log(`   ⚠️ Non-OK orders (included in stock calc): ${nonOkOrders.length}`);
            
            nonOkOrders.forEach(order => {
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
                console.log(`     📋 Added order: ${order.delivery_date} - ${order.quantity} pcs (${order.order_number})`);
            });
            
            // ✅ FIXED: Add forecast data with enhanced debugging and proper date handling
            console.log(`\n📈 FIXED: Checking forecasts for ${product}...`);
            console.log(`📊 FIXED: Available forecast keys:`, Object.keys(this.forecastData));
            
            let forecastsFound = 0;
            const currentYear = new Date().getFullYear();
            
            Object.keys(this.forecastData).forEach(key => {
                if (key.startsWith(product + '-')) {
                    const monthDate = key.split('-').slice(1).join('-'); // Get the MM/01 part
                    const quantity = this.forecastData[key];
                    
                    console.log(`🔍 FIXED: Checking forecast key: ${key}`);
                    console.log(`   Month Date: ${monthDate}`);
                    console.log(`   Quantity: ${quantity} (type: ${typeof quantity})`);
                    
                    // ✅ Enhanced type checking and conversion
                    let validQuantity = 0;
                    if (quantity !== undefined && quantity !== null && quantity !== '') {
                        validQuantity = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
                        if (isNaN(validQuantity)) {
                            validQuantity = 0;
                        }
                    }
                    
                    if (validQuantity > 0) {
                        // ✅ FIXED: Convert MM/01 to proper YYYY/MM/01 format for sorting
                        const parts = monthDate.split('/');
                        if (parts.length >= 2) {
                            const month = parts[0];
                            const day = parts[1] || '01';
                            
                            // Use current year for forecast dates
                            const fullDate = `${currentYear}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
                            
                            const forecastItem = {
                                type: 'forecast',
                                date: fullDate,
                                quantity: validQuantity,
                                product: product,
                                monthDate: monthDate, // Keep original MM/01 format for stock key matching
                                forecastKey: key,
                                priority: 3 // Lower priority than orders for sorting
                            };
                            
                            items.push(forecastItem);
                            forecastsFound++;
                            
                            console.log(`✅ FIXED: Added forecast item:`);
                            console.log(`   Original Key: ${key}`);
                            console.log(`   Month Date: ${monthDate}`);
                            console.log(`   Full Date: ${fullDate}`);
                            console.log(`   Quantity: ${validQuantity}`);
                            console.log(`   Type: forecast`);
                        } else {
                            console.log(`❌ FIXED: Invalid month date format: ${monthDate}`);
                        }
                    } else {
                        console.log(`⚠️ FIXED: Skipped forecast ${key} - invalid quantity: ${quantity}`);
                    }
                }
            });
            
            console.log(`📊 FIXED: Found ${forecastsFound} valid forecasts for ${product}`);
        });
        
        // ✅ Sort chronologically by date (orders and forecasts together)
        items.sort((a, b) => {
            const dateA = this.parseDate(a.date);
            const dateB = this.parseDate(b.date);
            
            // If dates are equal, prioritize by type (orders before forecasts)
            if (dateA.getTime() === dateB.getTime()) {
                return a.priority - b.priority;
            }
            
            return dateA - dateB;
        });
        
        console.log(`\n📦 FIXED: Final item list for stock calculation:`);
        console.log(`   Total items: ${items.length}`);
        console.log(`   Orders: ${items.filter(i => i.type === 'order').length}`);
        console.log(`   Forecasts: ${items.filter(i => i.type === 'forecast').length}`);
        
        // Enhanced logging of chronological order
        items.forEach((item, index) => {
            const typeIcon = item.type === 'order' ? '📋' : '📈';
            console.log(`   ${index + 1}. ${typeIcon} ${item.date}: ${item.quantity} pcs (${item.product})`);
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

    // Enhanced stock sufficiency check with better fallback logic and forecast support
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
                console.warn(`⚠️ FIXED: Product ${drawingNumber} not found in any group`);
                return true; // Default to sufficient if product not found
            }
            
            const calculations = this.stockCalculations[groupKey];
            if (!calculations) {
                console.warn(`⚠️ FIXED: No calculations found for group ${groupKey}`);
                return true; // Default to sufficient if no calculations
            }
            
            // If no stock at all, everything is insufficient
            if (calculations.allItemsInsufficient || calculations.currentStock <= 0) {
                console.log(`🔴 FIXED: No stock available for ${groupKey} - marking as insufficient`);
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
                // For forecasts, use the drawing number and month date
                itemKey = `forecast-${drawingNumber}-${item.monthDate}`;
            }
            
            if (itemKey && calculations.itemAvailability[itemKey]) {
                const result = calculations.itemAvailability[itemKey].sufficient;
                console.log(`🔍 FIXED: Stock check for ${itemKey}: ${result ? 'SUFFICIENT ✓' : 'INSUFFICIENT ✗'}`);
                return result;
            }
            
            console.warn(`⚠️ FIXED: Item key ${itemKey} not found in availability calculations for ${groupKey}`);
            console.log(`FIXED: Available keys:`, Object.keys(calculations.itemAvailability || {}));
            return true; // Default to sufficient if not found
            
        } catch (error) {
            console.error('❌ FIXED: Error checking stock sufficiency:', error);
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
            
            // FIXED: Use authenticated request
            const response = await this.authUtils.makeAuthenticatedRequest('/api/import-edi', {
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
            console.error('❌ FIXED: Import error:', error);
            
            if (error.message.includes('Authentication required') || error.message.includes('Session expired')) {
                this.showMessage('Session expired. Please log in again.', 'error');
            } else if (error.message.includes('403')) {
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
            // FIXED: Use authenticated request
            const response = await this.authUtils.makeAuthenticatedRequest(`/api/edi-data/${orderId}`, {
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
            console.error('❌ FIXED: Save status error:', error);
            
            if (error.message.includes('Authentication required') || error.message.includes('Session expired')) {
                this.showMessage('Session expired. Please log in again.', 'error');
            } else if (error.message.includes('403')) {
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
                // FIXED: Use authenticated request
                const response = await this.authUtils.makeAuthenticatedRequest(`/api/edi-data/${orderId}`, {
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
                console.error('❌ FIXED: Save all error:', error);
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
            console.log('📊 FIXED: Starting CSV export with auth...');
            this.showMessage('Preparing CSV export...', 'info');
            
            // FIXED: Use authenticated request
            const response = await this.authUtils.makeAuthenticatedRequest('/api/export/csv');
            
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
            console.log('✅ FIXED: CSV export completed');
            
        } catch (error) {
            console.error('❌ FIXED: CSV export error:', error);
            
            if (error.message.includes('Authentication required') || error.message.includes('Session expired')) {
                this.showMessage('Session expired. Please log in again.', 'error');
            } else {
                this.showMessage('Failed to export CSV file: ' + error.message, 'error');
            }
        }
    }

    async exportToJSON() {
        try {
            console.log('📊 FIXED: Starting JSON export with auth...');
            this.showMessage('Preparing JSON export...', 'info');
            
            // FIXED: Use authenticated request
            const response = await this.authUtils.makeAuthenticatedRequest('/api/export/json');
            
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
            console.log('✅ FIXED: JSON export completed');
            
        } catch (error) {
            console.error('❌ FIXED: JSON export error:', error);
            
            if (error.message.includes('Authentication required') || error.message.includes('Session expired')) {
                this.showMessage('Session expired. Please log in again.', 'error');
            } else {
                this.showMessage('Failed to export JSON file: ' + error.message, 'error');
            }
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

    // ✅ FIXED: Enhanced chart rendering with correct stock-based styling
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
        
        // Draw bars with FIXED stock-based rendering
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
                    
                    // FIXED: Critical distinction between OK status and stock-based rendering
                    const isOkStatus = order.status && order.status.toLowerCase().trim() === 'ok';
                    
                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('x', x);
                    rect.setAttribute('y', segmentY);
                    rect.setAttribute('width', barWidth);
                    rect.setAttribute('height', segmentHeight);
                    rect.setAttribute('class', 'bar-segment');
                    
                    if (isOkStatus) {
                        // ✅ FIXED: OK status orders are ALWAYS solid green (completed, no stock needed)
                        rect.setAttribute('fill', statusColor); // Green
                        rect.setAttribute('opacity', '1');
                        rect.setAttribute('stroke', 'white');
                        rect.setAttribute('stroke-width', '2');
                        console.log(`✅ FIXED: OK status order rendered as solid green: ${order.orderNumber}`);
                    } else {
                        // Non-OK orders: check stock availability
                        const orderItem = {
                            type: 'order',
                            orderNumber: order.orderNumber,
                            date: d.date
                        };
                        const hasStock = this.isItemStockSufficient(drawingNumber, orderItem);
                        
                        if (hasStock) {
                            // Sufficient stock: normal filled bar
                            rect.setAttribute('fill', statusColor);
                            rect.setAttribute('opacity', '1');
                            rect.setAttribute('stroke', 'white');
                            rect.setAttribute('stroke-width', '1');
                            console.log(`✅ FIXED: Non-OK order with sufficient stock: ${order.orderNumber}`);
                        } else {
                            // Insufficient stock: transparent with dashed outline
                            rect.setAttribute('fill', 'none');
                            rect.setAttribute('stroke', statusColor);
                            rect.setAttribute('stroke-width', '2');
                            rect.setAttribute('opacity', '0.7');
                            rect.setAttribute('stroke-dasharray', '4,4');
                            console.log(`❌ FIXED: Non-OK order with insufficient stock: ${order.orderNumber}`);
                        }
                    }
                    
                    // Enhanced tooltip with clear stock information
                    const stockText = isOkStatus ? ' [COMPLETED - No stock needed]' : 
                                    (this.isItemStockSufficient(drawingNumber, {type: 'order', orderNumber: order.orderNumber, date: d.date}) ? ' [Stock Available]' : ' [INSUFFICIENT STOCK]');
                    const statusText = order.status ? ` (Status: "${order.status}")` : ' (No status)';
                    const tooltipText = `${this.formatDateShort(d.date)} - ${order.orderNumber}\nQuantity: ${order.quantity}${statusText}${stockText}`;
                    rect.setAttribute('title', tooltipText);
                    
                    svg.appendChild(rect);
                    
                    // Add separator lines between segments
                    if (orderIndex > 0) {
                        const lineY = barBottom - cumulativeHeight;
                        const separatorLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        separatorLine.setAttribute('x1', x);
                        separatorLine.setAttribute('y1', lineY);
                        separatorLine.setAttribute('x2', x + barWidth);
                        separatorLine.setAttribute('y2', lineY);
                        separatorLine.setAttribute('stroke', 'white');
                        separatorLine.setAttribute('stroke-width', '2');
                        separatorLine.setAttribute('opacity', '0.9');
                        svg.appendChild(separatorLine);
                    }
                    
                    cumulativeHeight += segmentHeight;
                });
                
                // Add order count label if multiple orders
                if (d.orders.length > 1) {
                    const hasAnyOkStatus = d.orders.some(order => 
                        order.status && order.status.toLowerCase().trim() === 'ok'
                    );
                    const hasAnyStock = hasAnyOkStatus || d.orders.some(order => {
                        const isOkStatus = order.status && order.status.toLowerCase().trim() === 'ok';
                        if (isOkStatus) return true; // OK orders don't need stock
                        
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
                
            } else if (d.type === 'forecast') {
                // ✅ FIXED: Enhanced forecast rendering with clear stock-based styling
                const forecastItem = {
                    type: 'forecast',
                    monthDate: d.monthDate,
                    date: d.date
                };
                const hasStock = this.isItemStockSufficient(drawingNumber, forecastItem);
                
                // Enhanced debug logging for forecast stock calculation
                console.log(`📊 FIXED: Forecast bar analysis:`);
                console.log(`   Product: ${drawingNumber}`);
                console.log(`   Date: ${d.displayDate} (${d.date})`);
                console.log(`   Month Date: ${d.monthDate}`);
                console.log(`   Quantity: ${d.quantity}`);
                console.log(`   Has Stock: ${hasStock}`);
                console.log(`   Item Key: forecast-${drawingNumber}-${d.monthDate}`);
                
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', x);
                rect.setAttribute('y', barBottom - totalBarHeight);
                rect.setAttribute('width', barWidth);
                rect.setAttribute('height', totalBarHeight);
                rect.setAttribute('class', 'bar-segment');
                
                if (hasStock) {
                    // ✅ FIXED: Sufficient stock - SOLID filled forecast bar (gray)
                    rect.setAttribute('fill', '#9ca3af'); // Darker gray for better visibility
                    rect.setAttribute('stroke', '#6b7280'); // Dark gray border
                    rect.setAttribute('stroke-width', '2');
                    rect.setAttribute('opacity', '0.9');
                    // NO stroke-dasharray - completely solid
                    console.log(`✅ FIXED: Forecast rendered as SOLID (sufficient stock): ${d.displayDate}`);
                } else {
                    // ❌ FIXED: Insufficient stock - transparent with dashed warning outline
                    rect.setAttribute('fill', 'none');
                    rect.setAttribute('stroke', '#dc2626'); // Red warning
                    rect.setAttribute('stroke-width', '3');
                    rect.setAttribute('stroke-dasharray', '6,6'); // Dashed pattern
                    rect.setAttribute('opacity', '0.8');
                    console.log(`❌ FIXED: Forecast rendered as DASHED (insufficient stock): ${d.displayDate}`);
                }
                
                const stockText = hasStock ? ' [STOCK AVAILABLE ✓]' : ' [INSUFFICIENT STOCK ❌]';
                const tooltipText = `Forecast: ${d.displayDate}\nQuantity: ${d.quantity}${stockText}`;
                rect.setAttribute('title', tooltipText);
                svg.appendChild(rect);
                
                // Add forecast label with clear stock status indication
                const forecastLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                forecastLabel.setAttribute('class', 'chart-text');
                forecastLabel.setAttribute('x', x + barWidth / 2);
                forecastLabel.setAttribute('y', barBottom - totalBarHeight - 25);
                forecastLabel.setAttribute('text-anchor', 'middle');
                forecastLabel.setAttribute('font-size', '11');
                forecastLabel.setAttribute('fill', hasStock ? '#6b7280' : '#dc2626');
                forecastLabel.setAttribute('font-weight', 'bold');
                forecastLabel.textContent = hasStock ? 'Forecast ✓' : 'Forecast ⚠';
                svg.appendChild(forecastLabel);
            }
            
            // Add quantity label on top of bar with stock indicator
            const hasAnyStock = d.type === 'order' ? 
                d.orders.some(order => {
                    const isOkStatus = order.status && order.status.toLowerCase().trim() === 'ok';
                    if (isOkStatus) return true; // OK orders always have "stock" (they're completed)
                    
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
            quantityText.textContent = d.quantity.toLocaleString();
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
            typeText.textContent = d.type === 'forecast' ? 
                (hasAnyStock ? 'Forecast ✓' : 'Forecast ✗') : 
                (hasAnyStock ? d.date.split('/')[0] : 'No Stock');
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
        
        // ✅ FIXED: Enhanced legend with clear stock integration explanation
        const legendY = margin.top;
        const legendItems = [
            { color: '#059669', label: 'OK/Completed (Always Solid)', solid: true },
            { color: '#f59e0b', label: 'With Comments (Stock-based)', solid: true },
            { color: '#4f46e5', label: 'No Status (Stock-based)', solid: true },
            { color: '#9ca3af', label: 'Forecast (Solid=Stock OK)', solid: true },
            { color: '#dc2626', label: 'Insufficient Stock (Dashed)', outline: true, warning: true }
        ];
        
        legendItems.forEach((item, index) => {
            const legendX = width - margin.right - 350 + (index * 70);
            
            const legendRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            legendRect.setAttribute('x', legendX);
            legendRect.setAttribute('y', legendY);
            legendRect.setAttribute('width', '12');
            legendRect.setAttribute('height', '12');
            
            if (item.outline && item.warning) {
                legendRect.setAttribute('fill', 'none');
                legendRect.setAttribute('stroke', item.color);
                legendRect.setAttribute('stroke-width', '3');
                legendRect.setAttribute('stroke-dasharray', '3,3');
            } else {
                legendRect.setAttribute('fill', item.color);
                legendRect.setAttribute('stroke', '#ffffff');
                legendRect.setAttribute('stroke-width', '1');
                legendRect.setAttribute('opacity', '0.9');
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
        titleText.textContent = '✅ FIXED: Stock-Based Visualization - OK Status Always Solid | Forecasts: Solid=Enough Stock, Dashed=Insufficient';
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
        
        console.log(`📊 FIXED: Merged data for chart: ${combined.length} items (${orderData.length} orders + ${forecastBars.length} forecasts)`);
        return combined;
    }

    // Get forecast bars for chart with better date matching and type conversion
    getForecastBarsForChart(drawingNumber, existingData) {
        console.log(`📊 FIXED: Getting forecast bars for ${drawingNumber}`);
        console.log(`📊 FIXED: Available forecast data keys:`, Object.keys(this.forecastData));
        console.log(`📊 FIXED: Available forecast data:`, this.forecastData);
        
        const forecastBars = [];
        const now = new Date();
        
        // Get existing delivery dates to avoid overlap
        const existingDates = new Set(existingData.map(d => d.date));
        console.log(`📊 FIXED: Existing delivery dates:`, Array.from(existingDates));
        
        // Generate 6 months from current month with consistent formatting
        for (let i = 0; i < 6; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const month = date.getMonth() + 1;
            const year = date.getFullYear();
            
            // Use consistent MM/01 format (matching forecast.html saving format)
            const monthKey = `${String(month).padStart(2, '0')}/01`;
            const forecastKey = `${drawingNumber}-${monthKey}`;
            
            console.log(`📊 FIXED: Checking forecast key: ${forecastKey}`);
            
            // Enhanced type checking and conversion
            let forecastValue = this.forecastData[forecastKey];
            
            // Handle both string and number values, convert to number
            if (forecastValue !== undefined && forecastValue !== null && forecastValue !== '') {
                forecastValue = typeof forecastValue === 'string' ? parseFloat(forecastValue) : forecastValue;
                console.log(`📊 FIXED: Forecast value for ${forecastKey}: ${forecastValue} (type: ${typeof forecastValue})`);
            } else {
                console.log(`📊 FIXED: No forecast value for ${forecastKey} (value: ${forecastValue})`);
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
                    console.log(`✅ FIXED: Added forecast bar:`, forecastBar);
                } else {
                    console.log(`⚠️ FIXED: Skipping forecast ${fullDate} - overlaps with existing delivery`);
                }
            } else {
                console.log(`⚠️ FIXED: Invalid forecast data for ${forecastKey}: value=${forecastValue}, isNaN=${isNaN(forecastValue)}`);
            }
        }
        
        console.log(`📊 FIXED: Final forecast bars for ${drawingNumber}:`, forecastBars);
        console.log(`📊 FIXED: Total forecast bars: ${forecastBars.length}`);
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

    // ============ ENHANCED DEBUGGING METHODS ============
    
    debugStockCalculationsDetailed(drawingNumber = null) {
        console.log('🔍 DETAILED STOCK CALCULATION DEBUG:');
        console.log('====================================');
        
        // Show current stock levels
        console.log('\n📦 CURRENT STOCK LEVELS:');
        Object.keys(this.productGroups).forEach(groupKey => {
            const group = this.productGroups[groupKey];
            const stockData = this.materialStocks[groupKey];
            const currentStock = stockData ? stockData.quantity : 0;
            console.log(`   ${group.name} (${groupKey}): ${currentStock} pieces`);
        });
        
        // Show forecast data
        console.log('\n📈 FORECAST DATA:');
        console.log('   Total entries:', Object.keys(this.forecastData).length);
        Object.keys(this.forecastData).forEach(key => {
            const value = this.forecastData[key];
            if (value > 0) {
                console.log(`   ${key}: ${value}`);
            }
        });
        
        // Focus on specific product if provided
        const productsToDebug = drawingNumber ? [drawingNumber] : 
            ['PP4166-4681P003', 'PP4166-4726P003', 'PP4166-4731P002', 'PP4166-7106P001'];
        
        productsToDebug.forEach(product => {
            console.log(`\n🔍 DETAILED ANALYSIS FOR ${product}:`);
            console.log('='.repeat(50));
            
            // Find which group this product belongs to
            let groupKey = null;
            Object.keys(this.productGroups).forEach(key => {
                if (this.productGroups[key].products.includes(product)) {
                    groupKey = key;
                }
            });
            
            if (!groupKey) {
                console.log('❌ Product not found in any group!');
                return;
            }
            
            const group = this.productGroups[groupKey];
            const stockData = this.materialStocks[groupKey];
            const currentStock = stockData ? stockData.quantity : 0;
            
            console.log(`   Group: ${group.name} (${groupKey})`);
            console.log(`   Available Stock: ${currentStock} pieces`);
            
            // Get all orders for this product
            const allOrders = this.ediData.filter(order => order.drawing_number === product);
            const nonOkOrders = allOrders.filter(order => 
                !order.status || order.status.toLowerCase().trim() !== 'ok'
            );
            const okOrders = allOrders.filter(order => 
                order.status && order.status.toLowerCase().trim() === 'ok'
            );
            
            console.log(`\n   📋 EDI ORDERS ANALYSIS:`);
            console.log(`     Total orders: ${allOrders.length}`);
            console.log(`     OK/Completed orders: ${okOrders.length} (don't need stock)`);
            console.log(`     Non-OK orders: ${nonOkOrders.length} (need stock)`);
            
            if (okOrders.length > 0) {
                console.log(`     ✅ OK Orders (will be solid green):`)
                okOrders.forEach(order => {
                    console.log(`       ${order.delivery_date}: ${order.quantity} pcs (${order.order_number}) - STATUS: "${order.status}"`);
                });
            }
            
            if (nonOkOrders.length > 0) {
                console.log(`     ⚠️ Non-OK Orders (stock dependent):`)
                nonOkOrders.forEach(order => {
                    const status = order.status || 'no status';
                    console.log(`       ${order.delivery_date}: ${order.quantity} pcs (${order.order_number}) - STATUS: "${status}"`);
                });
            }
            
            // Get all forecasts for this product
            const productForecasts = [];
            Object.keys(this.forecastData).forEach(key => {
                if (key.startsWith(product + '-')) {
                    const monthDate = key.split('-').slice(1).join('-');
                    const quantity = this.forecastData[key];
                    if (quantity > 0) {
                        productForecasts.push({ key, monthDate, quantity });
                    }
                }
            });
            
            console.log(`\n   📈 FORECAST ANALYSIS:`);
            console.log(`     Total forecasts: ${productForecasts.length}`);
            productForecasts.forEach(forecast => {
                console.log(`       ${forecast.monthDate}: ${forecast.quantity} pcs (key: ${forecast.key})`);
            });
            
            // Show combined timeline with stock consumption
            console.log(`\n   🧮 STOCK CONSUMPTION TIMELINE:`);
            const items = this.getAllItemsForGroupFixed([product]);
            const groupStock = currentStock;
            let runningStock = groupStock;
            
            console.log(`     Starting stock: ${runningStock} pieces`);
            
            items.forEach((item, index) => {
                const beforeStock = runningStock;
                runningStock -= item.quantity;
                const afterStock = Math.max(0, runningStock);
                const sufficient = beforeStock >= item.quantity;
                
                const typeIcon = item.type === 'order' ? '📋' : '📈';
                const statusIcon = sufficient ? '✅' : '❌';
                const extraInfo = item.type === 'order' ? 
                    ` (${item.orderNumber}, status: "${item.status}")` : 
                    ` (forecast)`;
                
                console.log(`     ${index + 1}. ${typeIcon} ${item.date}: -${item.quantity} pcs${extraInfo}`);
                console.log(`        Stock: ${beforeStock} → ${afterStock} ${statusIcon} ${sufficient ? 'SUFFICIENT' : 'INSUFFICIENT'}`);
            });
            
            console.log(`     Final stock: ${Math.max(0, runningStock)} pieces`);
            
            // Show how this maps to chart rendering
            console.log(`\n   🎨 CHART RENDERING LOGIC:`);
            
            // Check orders
            if (okOrders.length > 0) {
                console.log(`     ✅ OK Orders → Always SOLID GREEN (regardless of stock)`);
            }
            
            if (nonOkOrders.length > 0) {
                console.log(`     ⚠️ Non-OK Orders → Stock-based rendering:`);
                nonOkOrders.forEach(order => {
                    const orderItem = {
                        type: 'order',
                        orderNumber: order.order_number,
                        date: order.delivery_date
                    };
                    const hasStock = this.isItemStockSufficient(product, orderItem);
                    const renderStyle = hasStock ? 'SOLID colored' : 'DASHED outline';
                    console.log(`       ${order.order_number}: ${renderStyle}`);
                });
            }
            
            // Check forecasts
            if (productForecasts.length > 0) {
                console.log(`     📈 Forecasts → Stock-based rendering:`);
                productForecasts.forEach(forecast => {
                    const forecastItem = {
                        type: 'forecast',
                        monthDate: forecast.monthDate,
                        date: `2024/${forecast.monthDate.replace('/01', '/01')}`
                    };
                    const hasStock = this.isItemStockSufficient(product, forecastItem);
                    const renderStyle = hasStock ? 'SOLID GRAY' : 'DASHED RED';
                    console.log(`       ${forecast.monthDate}: ${renderStyle} (${forecast.quantity} pcs)`);
                });
            }
        });
        
        console.log('\n✅ DEBUG COMPLETE');
        console.log('================');
    }

    verifyForecastDataIntegrity() {
        console.log('🔍 FIXED: Verifying forecast data integrity...');
        
        const now = new Date();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
        const currentKey = `${currentMonth}/01`;
        
        console.log(`🔍 FIXED: Current month key format: ${currentKey}`);
        
        let foundDataCount = 0;
        this.DRAWING_NUMBER_ORDER.forEach(product => {
            const testKey = `${product}-${currentKey}`;
            const hasData = this.forecastData.hasOwnProperty(testKey);
            const value = this.forecastData[testKey];
            
            console.log(`🔍 FIXED: Testing ${testKey}: ${hasData ? 'EXISTS' : 'MISSING'} (value: ${value})`);
            if (hasData && value > 0) {
                foundDataCount++;
            }
        });
        
        console.log(`🔍 FIXED: Found ${foundDataCount} forecast entries for current month`);
        
        if (foundDataCount === 0) {
            console.warn('⚠️ FIXED: No forecast data found for current month. Check date format consistency.');
            this.debugForecastDateFormats();
        }
    }

    debugForecastDateFormats() {
        console.log('🔍 FIXED: DEBUGGING FORECAST DATE FORMATS:');
        
        // Show all available keys and their formats
        Object.keys(this.forecastData).forEach(key => {
            const parts = key.split('-');
            const drawingNumber = parts[0];
            const dateKey = parts.slice(1).join('-');
            console.log(`🔍 FIXED: Key: ${key} | Drawing: ${drawingNumber} | Date: ${dateKey} | Value: ${this.forecastData[key]}`);
        });
        
        // Show expected format for current month
        const now = new Date();
        const expectedFormat = `${String(now.getMonth() + 1).padStart(2, '0')}/01`;
        console.log(`🔍 FIXED: Expected current month format: ${expectedFormat}`);
        
        // Test format variations
        const testFormats = [
            `${now.getMonth() + 1}/01`,
            `${String(now.getMonth() + 1).padStart(2, '0')}/01`,
            `${String(now.getMonth() + 1).padStart(2, '0')}/1`,
            `${now.getMonth() + 1}/1`
        ];
        
        console.log('🔍 FIXED: Testing format variations for first product:');
        const testProduct = this.DRAWING_NUMBER_ORDER[0];
        testFormats.forEach(format => {
            const testKey = `${testProduct}-${format}`;
            const exists = this.forecastData.hasOwnProperty(testKey);
            console.log(`🔍 FIXED: Format ${format}: ${testKey} ${exists ? 'EXISTS' : 'MISSING'}`);
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
                    console.log('📡 FIXED: Received cross-window message:', message);
                    
                    if (message.source !== 'dashboard') {
                        // Reload data if updated from another window
                        if (message.type === 'STOCK_UPDATED' || message.type === 'FORECAST_UPDATED') {
                            console.log('🔄 FIXED: Reloading data due to external update');
                            this.loadData();
                        }
                    }
                } catch (error) {
                    console.warn('Could not parse cross-window message:', error);
                }
            }
        });
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
            console.log('🚀 FIXED: Initializing Enhanced EDI Dashboard with improved session management...');
            
            // FIXED: Wait for auth utils to be ready if not already initialized
            if (!this.authUtils || !this.authUtils.userInfo) {
                console.log('🔄 FIXED: Waiting for auth utils initialization...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Load user authentication info
            await this.loadUserInfo();
            
            // Only proceed if we have valid authentication
            if (this.currentUser) {
                // Load EDI data with stock integration
                await this.loadData();
                
                // Initialize file and button handlers
                this.initializeFileHandlers();
                this.initializeButtonHandlers();
                
                // Setup cross-window communication
                this.setupCrossWindowCommunication();
                
                // Set up auto-refresh every 5 minutes
                setInterval(() => {
                    if (document.visibilityState === 'visible' && this.currentUser) {
                        this.loadData();
                    }
                }, 300000);
                
                console.log('✅ FIXED: Enhanced Dashboard initialized successfully with stable session management');
            } else {
                console.log('❌ FIXED: Dashboard initialization failed - no valid authentication');
            }
        } catch (error) {
            console.error('❌ FIXED: Failed to initialize dashboard:', error);
            this.showMessage('Failed to initialize dashboard. Please refresh the page.', 'error');
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
        console.error('❌ FIXED: EDI Dashboard not found');
        alert('Export functionality not available');
    }
};

window.exportToJSON = function() {
    if (window.ediDashboard) {
        window.ediDashboard.exportToJSON();
    } else {
        console.error('❌ FIXED: EDI Dashboard not found');
        alert('Export functionality not available');
    }
};

// ✅ FIXED: Enhanced debug testing functions
window.debugStockForProduct = function(drawingNumber) {
    if (window.ediDashboard) {
        window.ediDashboard.debugStockCalculationsDetailed(drawingNumber);
    } else {
        console.log('❌ EDI Dashboard not found');
    }
};

window.debugAllStockCalculations = function() {
    if (window.ediDashboard) {
        window.ediDashboard.debugStockCalculationsDetailed();
    } else {
        console.log('❌ EDI Dashboard not found');
    }
};

window.testForecastStockCalculation = function() {
    console.log('🧪 TESTING FORECAST STOCK CALCULATION');
    console.log('=====================================');
    
    if (!window.ediDashboard) {
        console.log('❌ EDI Dashboard not found');
        return;
    }
    
    const dashboard = window.ediDashboard;
    
    // Test each product group
    Object.keys(dashboard.productGroups).forEach(groupKey => {
        const group = dashboard.productGroups[groupKey];
        console.log(`\n🔍 Testing ${group.name} (${groupKey}):`);
        
        // Get current stock for this group
        const stockData = dashboard.materialStocks[groupKey];
        const currentStock = stockData ? stockData.quantity : 0;
        console.log(`   Current stock: ${currentStock} pieces`);
        
        // Test each product in the group
        group.products.forEach(product => {
            console.log(`\n   📦 Product: ${product}`);
            
            // Find forecasts for this product
            const productForecasts = [];
            Object.keys(dashboard.forecastData).forEach(key => {
                if (key.startsWith(product + '-')) {
                    const monthDate = key.split('-').slice(1).join('-');
                    const quantity = dashboard.forecastData[key];
                    if (quantity > 0) {
                        productForecasts.push({ key, monthDate, quantity });
                    }
                }
            });
            
            if (productForecasts.length === 0) {
                console.log(`     ⚠️ No forecasts found for ${product}`);
                return;
            }
            
            // Test stock sufficiency for each forecast
            productForecasts.forEach(forecast => {
                const forecastItem = {
                    type: 'forecast',
                    monthDate: forecast.monthDate,
                    date: `2024/${forecast.monthDate.replace('/01', '/01')}`
                };
                
                const hasStock = dashboard.isItemStockSufficient(product, forecastItem);
                const expectedKey = `forecast-${product}-${forecast.monthDate}`;
                
                console.log(`     📈 Forecast ${forecast.monthDate}:`);
                console.log(`       Quantity: ${forecast.quantity} pieces`);
                console.log(`       Expected key: ${expectedKey}`);
                console.log(`       Has stock: ${hasStock ? '✅ YES' : '❌ NO'}`);
                console.log(`       Will render as: ${hasStock ? 'SOLID GRAY BAR' : 'DASHED RED OUTLINE'}`);
                
                // Check if the key exists in stock calculations
                const calculations = dashboard.stockCalculations[groupKey];
                if (calculations && calculations.itemAvailability) {
                    const itemData = calculations.itemAvailability[expectedKey];
                    if (itemData) {
                        console.log(`       ✅ Found in calculations: sufficient=${itemData.sufficient}`);
                    } else {
                        console.log(`       ❌ NOT found in calculations!`);
                        console.log(`       Available keys:`, Object.keys(calculations.itemAvailability));
                    }
                } else {
                    console.log(`       ❌ No calculations found for group ${groupKey}`);
                }
            });
        });
    });
    
    console.log('\n✅ FORECAST STOCK TEST COMPLETE');
    
    // Summary
    const totalForecasts = Object.keys(dashboard.forecastData).filter(key => 
        dashboard.forecastData[key] > 0
    ).length;
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total forecasts with quantity > 0: ${totalForecasts}`);
    console.log(`   Product groups with stock: ${Object.keys(dashboard.materialStocks).length}`);
    console.log(`   Groups with calculations: ${Object.keys(dashboard.stockCalculations).length}`);
};

window.testSingleForecast = function(drawingNumber, monthDate) {
    if (!window.ediDashboard) {
        console.log('❌ EDI Dashboard not found');
        return;
    }
    
    const dashboard = window.ediDashboard;
    const forecastKey = `${drawingNumber}-${monthDate}`;
    const quantity = dashboard.forecastData[forecastKey];
    
    console.log(`🧪 TESTING SINGLE FORECAST: ${forecastKey}`);
    console.log(`   Quantity: ${quantity || 'NOT FOUND'}`);
    
    if (!quantity || quantity <= 0) {
        console.log('❌ Forecast not found or has zero quantity');
        return;
    }
    
    const forecastItem = {
        type: 'forecast',
        monthDate: monthDate,
        date: `2024/${monthDate.replace('/01', '/01')}`
    };
    
    const hasStock = dashboard.isItemStockSufficient(drawingNumber, forecastItem);
    console.log(`   Has stock: ${hasStock ? '✅ YES' : '❌ NO'}`);
    console.log(`   Should render as: ${hasStock ? 'SOLID GRAY BAR' : 'DASHED RED OUTLINE'}`);
    
    // Find which group this product belongs to
    let groupKey = null;
    Object.keys(dashboard.productGroups).forEach(key => {
        if (dashboard.productGroups[key].products.includes(drawingNumber)) {
            groupKey = key;
        }
    });
    
    if (groupKey) {
        const stockData = dashboard.materialStocks[groupKey];
        const currentStock = stockData ? stockData.quantity : 0;
        console.log(`   Group: ${groupKey}, Stock: ${currentStock} pieces`);
    }
};

window.testForceRefreshCharts = function() {
    console.log('🧪 FIXED: Force refreshing all charts...');
    ediDashboard.updateAllProductCharts();
};

window.testForecastAPI = async function() {
    console.log('🧪 FIXED: Testing forecast API directly...');
    try {
        const response = await window.authUtils.makeAuthenticatedRequest('/api/forecasts');
        const data = await response.json();
        console.log('📊 FIXED: Raw API response:', data);
        return data;
    } catch (error) {
        console.error('❌ FIXED: API test failed:', error);
        return null;
    }
};

window.testSessionDebug = async function() {
    try {
        const userInfo = await window.authUtils.checkAuthentication();
        console.log('🔍 FIXED: Session debug - User info:', userInfo);
        return userInfo;
    } catch (error) {
        console.log('❌ FIXED: Session debug failed:', error);
        return null;
    }
};

// Make dashboard available globally
window.ediDashboard = ediDashboard;

// FIXED: Initialize when DOM is ready with better timing
document.addEventListener('DOMContentLoaded', function() {
    // Add a small delay to ensure auth utils are ready
    setTimeout(() => {
        ediDashboard.initialize();
    }, 500);
});