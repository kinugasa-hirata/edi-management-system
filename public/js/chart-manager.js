// chart-manager.js - Chart rendering and management

class ChartManager {
    constructor() {
        this.DRAWING_NUMBER_ORDER = [
            'PP4166-4681P003',
            'PP4166-4681P004', 
            'PP4166-4726P003',
            'PP4166-4726P004',
            'PP4166-4731P002',
            'PP4166-7106P001',
            'PP4166-7106P003'
        ];
    }

    // Get status color based on comment/status content
    getStatusColor(status) {
        if (!status || status.trim() === '') {
            return '#4f46e5'; // Blue - No status
        } else if (status.toLowerCase().trim() === 'ok') {
            return '#059669'; // Green - OK status
        } else {
            return '#f59e0b'; // Yellow - Has comment but not OK
        }
    }

    // Format date to MM/DD
    formatDateShort(dateString) {
        if (!dateString) return '';
        try {
            const [year, month, day] = dateString.split('/');
            return `${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
        } catch {
            return dateString;
        }
    }

    // Parse date string to Date object
    parseDate(dateString) {
        if (!dateString) return null;
        try {
            const [year, month, day] = dateString.split('/');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        } catch {
            return null;
        }
    }

    // Filter orders for future dates only
    getFutureOrders(orders) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today
        
        return orders.filter(order => {
            const orderDate = this.parseDate(order.delivery_date);
            return orderDate && orderDate >= today;
        });
    }

    // Enhanced group orders by delivery date and sum quantities (with individual order tracking and status)
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

    // Enhanced create bar chart with status-based color coding and dotted lines
    createBarChart(containerId, data, drawingNumber) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (data.length === 0) {
            container.innerHTML = `
                <div class="no-data-state">
                    <h3>📅 No Future Orders</h3>
                    <p>There are no orders with delivery dates from today onwards for this product.</p>
                </div>
            `;
            return;
        }
        
        const width = container.clientWidth - 50;
        const height = 450; // Increased height to accommodate lower labels
        const margin = { top: 20, right: 30, bottom: 80, left: 60 }; // Increased bottom margin
        
        const chartWidth = width - margin.left - margin.right;
        const chartHeight = height - margin.top - margin.bottom;
        
        // Create SVG
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'chart-svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        
        // Calculate scales
        const maxQuantity = Math.max(...data.map(d => d.quantity));
        const barWidth = Math.min(60, chartWidth / data.length * 0.8); // Max width of 60px
        const barSpacing = (chartWidth - (barWidth * data.length)) / (data.length + 1);
        
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
        
        // Draw bars with status-based coloring, labels, and dotted lines
        data.forEach((d, i) => {
            const totalBarHeight = (d.quantity / maxQuantity) * chartHeight;
            const x = margin.left + barSpacing + (i * (barWidth + barSpacing));
            const barBottom = height - margin.bottom;
            
            // Draw multi-colored bar segments based on order status
            let cumulativeHeight = 0;
            d.orders.forEach((order, orderIndex) => {
                const segmentHeight = (order.quantity / d.quantity) * totalBarHeight;
                const segmentY = barBottom - cumulativeHeight - segmentHeight;
                const statusColor = this.getStatusColor(order.status);
                
                // Create colored bar segment
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', x);
                rect.setAttribute('y', segmentY);
                rect.setAttribute('width', barWidth);
                rect.setAttribute('height', segmentHeight);
                rect.setAttribute('fill', statusColor);
                rect.setAttribute('stroke', '#ffffff');
                rect.setAttribute('stroke-width', '0.5');
                rect.setAttribute('class', 'bar-segment');
                
                // Enhanced tooltip with status information
                const statusText = order.status ? ` (Status: "${order.status}")` : ' (No status)';
                const tooltipText = `${this.formatDateShort(d.date)} - ${order.orderNumber}\nQuantity: ${order.quantity}${statusText}`;
                rect.setAttribute('title', tooltipText);
                
                // Add hover effect
                rect.addEventListener('mouseenter', function() {
                    this.setAttribute('opacity', '0.8');
                });
                rect.addEventListener('mouseleave', function() {
                    this.setAttribute('opacity', '1');
                });
                
                svg.appendChild(rect);
                
                // Add dotted separator line between segments (except before first segment)
                if (orderIndex > 0) {
                    const lineY = barBottom - cumulativeHeight;
                    const dottedLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    dottedLine.setAttribute('x1', x);
                    dottedLine.setAttribute('y1', lineY);
                    dottedLine.setAttribute('x2', x + barWidth);
                    dottedLine.setAttribute('y2', lineY);
                    dottedLine.setAttribute('stroke', 'white');
                    dottedLine.setAttribute('stroke-width', '2');
                    dottedLine.setAttribute('stroke-dasharray', '4,2');
                    dottedLine.setAttribute('opacity', '0.9');
                    svg.appendChild(dottedLine);
                }
                
                cumulativeHeight += segmentHeight;
            });
            
            // Add quantity label on top of bar
            const quantityText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            quantityText.setAttribute('class', 'chart-text');
            quantityText.setAttribute('x', x + barWidth / 2);
            quantityText.setAttribute('y', barBottom - totalBarHeight - 5);
            quantityText.setAttribute('text-anchor', 'middle');
            quantityText.setAttribute('font-weight', 'bold');
            quantityText.setAttribute('font-size', '12');
            quantityText.setAttribute('fill', '#1f2937');
            quantityText.textContent = d.quantity;
            svg.appendChild(quantityText);
            
            // Add order count label if multiple orders
            if (d.orders.length > 1) {
                const countText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                countText.setAttribute('class', 'chart-text');
                countText.setAttribute('x', x + barWidth / 2);
                countText.setAttribute('y', barBottom - totalBarHeight - 20);
                countText.setAttribute('text-anchor', 'middle');
                countText.setAttribute('font-size', '10');
                countText.setAttribute('fill', '#6b7280');
                countText.textContent = `(${d.orders.length} orders)`;
                svg.appendChild(countText);
            }
            
            // Add date label below X-axis (moved lower)
            const dateText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            dateText.setAttribute('class', 'chart-label');
            dateText.setAttribute('x', x + barWidth / 2);
            dateText.setAttribute('y', height - margin.bottom + 25);
            dateText.setAttribute('text-anchor', 'middle');
            dateText.setAttribute('font-size', '11');
            dateText.setAttribute('font-weight', '500');
            dateText.textContent = this.formatDateShort(d.date);
            svg.appendChild(dateText);
            
            // Add full date on second line for clarity
            const fullDateText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            fullDateText.setAttribute('class', 'chart-label');
            fullDateText.setAttribute('x', x + barWidth / 2);
            fullDateText.setAttribute('y', height - margin.bottom + 40);
            fullDateText.setAttribute('text-anchor', 'middle');
            fullDateText.setAttribute('font-size', '9');
            fullDateText.setAttribute('fill', '#9ca3af');
            fullDateText.textContent = d.date.split('/')[0]; // Just the year
            svg.appendChild(fullDateText);
        });
        
        // Add Y-axis labels and grid lines
        const yLabelCount = 6;
        for (let i = 0; i <= yLabelCount; i++) {
            const value = Math.round((maxQuantity / yLabelCount) * i);
            const y = height - margin.bottom - (chartHeight / yLabelCount) * i;
            
            // Y-axis label
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('class', 'chart-text');
            label.setAttribute('x', margin.left - 10);
            label.setAttribute('y', y + 3);
            label.setAttribute('text-anchor', 'end');
            label.setAttribute('font-size', '11');
            label.textContent = value;
            svg.appendChild(label);
            
            // Grid line
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
        
        // Add status legend
        const legendY = margin.top;
        const legendItems = [
            { color: '#4f46e5', label: 'No Status' },
            { color: '#f59e0b', label: 'Has Comment' },
            { color: '#059669', label: 'OK Status' }
        ];
        
        legendItems.forEach((item, index) => {
            const legendX = width - margin.right - 120 + (index * 40);
            
            // Legend color box
            const legendRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            legendRect.setAttribute('x', legendX);
            legendRect.setAttribute('y', legendY);
            legendRect.setAttribute('width', '12');
            legendRect.setAttribute('height', '12');
            legendRect.setAttribute('fill', item.color);
            legendRect.setAttribute('stroke', '#ffffff');
            legendRect.setAttribute('stroke-width', '1');
            svg.appendChild(legendRect);
            
            // Legend text
            const legendText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            legendText.setAttribute('x', legendX + 16);
            legendText.setAttribute('y', legendY + 9);
            legendText.setAttribute('font-size', '8');
            legendText.setAttribute('fill', '#6b7280');
            legendText.textContent = item.label;
            svg.appendChild(legendText);
        });
        
        // Add enhanced chart title at the bottom
        const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        titleText.setAttribute('x', width / 2);
        titleText.setAttribute('y', height - 5);
        titleText.setAttribute('text-anchor', 'middle');
        titleText.setAttribute('font-size', '10');
        titleText.setAttribute('fill', '#6b7280');
        titleText.textContent = 'Delivery dates (MM/DD) with status-colored segments: Blue=No Status, Yellow=Comment, Green=OK';
        svg.appendChild(titleText);
        
        container.innerHTML = '';
        container.appendChild(svg);
    }

    // Generate product chart
    generateProductChart(drawingNumber, ediData) {
        const productOrders = ediData.filter(order => order.drawing_number === drawingNumber);
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

    // Update all product charts when data changes
    updateAllProductCharts(ediData) {
        this.DRAWING_NUMBER_ORDER.forEach(drawingNumber => {
            this.generateProductChart(drawingNumber, ediData);
        });
    }
}

// Create global instance
const chartManager = new ChartManager();