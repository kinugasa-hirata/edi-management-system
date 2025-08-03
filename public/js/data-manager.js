// data-manager.js - Data management and API operations

class DataManager {
    constructor() {
        this.ediData = [];
    }

    // Get current EDI data
    getEdiData() {
        return this.ediData;
    }

    // Set EDI data
    setEdiData(data) {
        this.ediData = data;
    }

    // Load data from API
    async loadData() {
        try {
            UIUtils.showLoading(true);
            
            const response = await fetch('/api/edi-data');
            
            if (response.status === 401) {
                UIUtils.showMessage('Session expired. Please log in again.', 'error');
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
            
            // Update UI
            this.renderTable();
            chartManager.updateAllProductCharts(this.ediData);
            
        } catch (error) {
            UIUtils.showMessage('Failed to load data: ' + error.message, 'error');
            console.error('Error loading data:', error);
        } finally {
            UIUtils.showLoading(false);
        }
    }

    // Import data from file
    async importData() {
        if (!authManager.canEdit()) {
            UIUtils.showMessage('You do not have permission to import data', 'error');
            return;
        }

        const fileInput = document.getElementById('fileInput');
        const file = fileInput.files[0];
        
        if (!file) {
            UIUtils.showMessage('Please select a file first', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('ediFile', file);

        try {
            UIUtils.showLoading(true);
            
            const response = await fetch('/api/import-edi', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                UIUtils.showMessage(result.message, 'success');
                await this.loadData(); // Reload data after import
                
                // Reset file input
                fileInput.value = '';
                const importBtn = document.getElementById('importBtn');
                if (importBtn) {
                    importBtn.disabled = true;
                    importBtn.textContent = '📤 Import WebEDI Data';
                }
            } else {
                UIUtils.showMessage(result.error || 'Import failed', 'error');
            }
        } catch (error) {
            if (error.message.includes('403')) {
                UIUtils.showMessage('You do not have permission to import data', 'error');
            } else {
                UIUtils.showMessage('Import failed: ' + error.message, 'error');
            }
        } finally {
            UIUtils.showLoading(false);
        }
    }

    // Save status for a single order
    async saveStatus(orderId) {
        if (!authManager.canEdit()) {
            UIUtils.showMessage('You do not have permission to save changes', 'error');
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
                UIUtils.showMessage('Status updated successfully', 'success');
                
                // Update local data
                const order = this.ediData.find(o => o.id == orderId);
                if (order) {
                    order.status = status;
                }
                
                // Update all product charts to reflect new status colors
                chartManager.updateAllProductCharts(this.ediData);
                
            } else {
                UIUtils.showMessage(result.error || 'Failed to update status', 'error');
            }
        } catch (error) {
            if (error.message.includes('403')) {
                UIUtils.showMessage('You do not have permission to save changes', 'error');
            } else {
                UIUtils.showMessage('Failed to save status: ' + error.message, 'error');
            }
        }
    }

    // Save all status changes
    async saveAllChanges() {
        if (!authManager.canEdit()) {
            UIUtils.showMessage('You do not have permission to save changes', 'error');
            return;
        }

        const inputs = document.querySelectorAll('.status-input:not(:disabled)');
        let updated = 0;
        let errors = 0;

        UIUtils.showLoading(true);

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

        UIUtils.showLoading(false);
        
        if (errors === 0) {
            UIUtils.showMessage(`All ${updated} changes saved successfully`, 'success');
        } else {
            UIUtils.showMessage(`${updated} saved, ${errors} errors occurred`, 'error');
        }
        
        // Update all product charts to reflect new status colors
        chartManager.updateAllProductCharts(this.ediData);
    }

    // Render data table
    renderTable() {
        const container = document.getElementById('dataContainer');
        const recordCount = document.getElementById('recordCount');
        
        if (recordCount) {
            recordCount.textContent = `${this.ediData.length} records`;
        }

        if (!container) return;

        if (this.ediData.length === 0) {
            const emptyMessage = authManager.canEdit() ? 
                'Import an EDI file to get started.' : 
                'No EDI data available. Contact admin to import data.';
            
            const steps = authManager.canEdit() ? `
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
                                           placeholder="${authManager.canEdit() ? 'Add comments...' : 'Read only'}"
                                           ${!authManager.canEdit() ? 'disabled' : ''}>
                                    ${authManager.canEdit() ? `<button class="save-btn" onclick="dataManager.saveStatus(${order.id})">Save</button>` : ''}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = tableHTML;
    }
}

// Create global instance
const dataManager = new DataManager();