// auth-manager.js - Authentication and user management

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.userPermissions = { canEdit: false, canView: true };
    }

    // Load user info and set permissions
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
            UIUtils.showMessage('Failed to load user information', 'error');
            return null;
        }
    }

    // Update user display in header
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

    // Update UI based on user permissions
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

    // Check if user can edit
    canEdit() {
        return this.userPermissions.canEdit;
    }

    // Check if user can view
    canView() {
        return this.userPermissions.canView;
    }

    // Get current user info
    getCurrentUser() {
        return this.currentUser;
    }

    // Logout user
    async logout() {
        try {
            await fetch('/api/logout', { method: 'POST' });
            window.location.href = '/';
        } catch (error) {
            console.error('Logout error:', error);
            window.location.href = '/';
        }
    }
}

// Create global instance
const authManager = new AuthManager();