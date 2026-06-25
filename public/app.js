document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('barcode-form');
    const serviceTypeSelect = document.getElementById('service-type');
    const quantityInput = document.getElementById('quantity');
    
    const topBar = document.getElementById('top-bar');
    const topUsername = document.getElementById('top-username');
    const logoutBtn = document.getElementById('logout-btn');
    
    const loginOverlay = document.getElementById('login-overlay');
    const loginForm = document.getElementById('login-form');
    const loginUser = document.getElementById('login-user');
    const loginPass = document.getElementById('login-pass');
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    
    // Check login status
    const savedToken = localStorage.getItem('postone_token');
    const savedUser = localStorage.getItem('postone_logged_in_user');
    
    if (savedToken === 'true' && savedUser) {
        if (loginOverlay) loginOverlay.classList.add('hidden');
        if (topBar) topBar.classList.remove('hidden');
        if (topUsername) topUsername.textContent = savedUser;
    } else {
        if (loginOverlay) loginOverlay.classList.remove('hidden');
        if (topBar) topBar.classList.add('hidden');
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('postone_token');
            localStorage.removeItem('postone_logged_in_user');
            location.reload();
        });
    }

    // Handle Login
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnText = loginSubmitBtn.querySelector('.btn-text');
            const spinner = loginSubmitBtn.querySelector('.spinner');
            
            loginSubmitBtn.disabled = true;
            btnText.textContent = 'กำลังตรวจสอบ...';
            spinner.classList.remove('hidden');
            
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: loginUser.value.trim(), pass: loginPass.value.trim() })
                });
                const data = await res.json();
                
                if (data.status === 'SUCCESS') {
                    localStorage.setItem('postone_token', 'true');
                    localStorage.setItem('postone_logged_in_user', loginUser.value.trim());
                    if (topUsername) topUsername.textContent = loginUser.value.trim();
                    
                    loginOverlay.classList.add('hidden');
                    if (topBar) topBar.classList.remove('hidden');
                    if(typeof showToast === 'function') showToast('เข้าสู่ระบบสำเร็จ!', '#34c759');
                } else {
                    alert(data.message || 'Username หรือ Password ไม่ถูกต้อง');
                }
            } catch (err) {
                console.error(err);
                alert('เกิดข้อผิดพลาดในการเชื่อมต่อระบบ Login');
            } finally {
                loginSubmitBtn.disabled = false;
                btnText.textContent = 'เข้าสู่ระบบ';
                spinner.classList.add('hidden');
            }
        });
    }

    // Check Google Sheets Status
    async function checkGoogleSheetsStatus() {
        try {
            const res = await fetch('/api/check-google-sheets');
            const data = await res.json();
            
            const badge = document.getElementById('gs-status-badge');
            const dot = document.getElementById('gs-status-dot');
            const text = document.getElementById('gs-status-text');
            
            if (badge && dot && text) {
                const count = (data.loginOk ? 1 : 0) + (data.historyOk ? 1 : 0);
                if (count === 2) {
                    badge.className = 'gs-status-badge connected';
                    dot.className = 'indicator-dot blink-green';
                    text.textContent = `เชื่อมต่อ Database แล้ว (${count}/2)`;
                } else if (count === 1) {
                    badge.className = 'gs-status-badge partial';
                    dot.className = 'indicator-dot blink-gray';
                    text.textContent = `Database ไม่สมบูรณ์ (${count}/2)`;
                } else {
                    badge.className = 'gs-status-badge disconnected';
                    dot.className = 'indicator-dot blink-red';
                    text.textContent = `Database ไม่เชื่อมต่อ (0/2)`;
                }
                
                // Update dropdown items
                const dotLogin = document.getElementById('dot-login');
                const dotHistory = document.getElementById('dot-history');
                if (dotLogin) dotLogin.className = data.loginOk ? 'indicator-dot blink-green' : 'indicator-dot blink-red';
                if (dotHistory) dotHistory.className = data.historyOk ? 'indicator-dot blink-green' : 'indicator-dot blink-red';
            }
        } catch (err) {
            console.error('Failed to check GS status:', err);
        }
    }
    
    // Toggle dropdown
    const gsBadge = document.getElementById('gs-status-badge');
    const gsDropdown = document.getElementById('gs-status-dropdown');
    
    if (gsBadge && gsDropdown) {
        gsBadge.addEventListener('click', () => {
            gsDropdown.classList.toggle('hidden');
        });
        
        // Hide when clicking outside
        document.addEventListener('click', (e) => {
            if (!gsBadge.contains(e.target) && !gsDropdown.contains(e.target)) {
                gsDropdown.classList.add('hidden');
            }
        });
    }
    
    // Call it when page loads
    checkGoogleSheetsStatus();
    
    // Auto-select quantity input on focus
    quantityInput.addEventListener('focus', () => {
        quantityInput.select();
    });

    const submitBtn = document.getElementById('submit-btn');
    const submitBtnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');
    
    const resultSection = document.getElementById('result-section');
    const barcodeList = document.getElementById('barcode-list');
    
    const metaPrefix = document.getElementById('meta-prefix');
    const metaRange = document.getElementById('meta-range');
    const metaCount = document.getElementById('meta-count');
    
    const copyAllBtn = document.getElementById('copy-all-btn');
    const downloadTxtBtn = document.getElementById('download-txt-btn');
    const downloadCsvBtn = document.getElementById('download-csv-btn');
    
    const toast = document.getElementById('toast');

    // Pagination elements
    const paginationControls = document.getElementById('pagination-controls');
    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');
    const pageInfo = document.getElementById('page-info');

    let currentBarcodes = [];
    let currentPage = 1;
    const itemsPerPage = 100;

    function renderTable(page) {
        if (!currentBarcodes || currentBarcodes.length === 0) {
            barcodeList.innerHTML = '';
            paginationControls.classList.add('hidden');
            return;
        }

        const totalPages = Math.ceil(currentBarcodes.length / itemsPerPage);
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;

        currentPage = page;
        
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, currentBarcodes.length);
        const pagedData = currentBarcodes.slice(startIndex, endIndex);

        barcodeList.innerHTML = '';
        pagedData.forEach((item, idx) => {
            const actualIndex = startIndex + idx;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="ลำดับ">${actualIndex + 1}</td>
                <td data-label="Serial">${item.serial}</td>
                <td data-label="Check Digit">${item.checkDigit}</td>
                <td data-label="บาร์โค้ด"><strong>${item.barcode}</strong></td>
                <td data-label="จัดการ">
                    <button class="btn-action copy-single" data-barcode="${item.barcode}">คัดลอก</button>
                </td>
            `;
            barcodeList.appendChild(row);
        });

        if (totalPages > 1) {
            paginationControls.classList.remove('hidden');
            pageInfo.textContent = `หน้า ${page} จาก ${totalPages}`;
            prevPageBtn.disabled = page === 1;
            nextPageBtn.disabled = page === totalPages;
        } else {
            paginationControls.classList.add('hidden');
        }
    }

    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            renderTable(currentPage - 1);
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(currentBarcodes.length / itemsPerPage);
        if (currentPage < totalPages) {
            renderTable(currentPage + 1);
        }
    });

    // Form Submit Event
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Show Loading
        submitBtn.disabled = true;
        submitBtnText.textContent = 'กำลังดึงข้อมูล...';
        spinner.classList.remove('hidden');
        resultSection.classList.add('hidden');
        
        const typ = serviceTypeSelect.value;
        const cnt = quantityInput.value;
        // The user is read from localStorage
        const user = localStorage.getItem('postone_logged_in_user') || 'Unknown';
        
        try {
            const response = await fetch(`/api/get-barcodes?typ=${typ}&cnt=${cnt}&user=${encodeURIComponent(user)}`);
            const data = await response.json();
            
            if (data.status === 'SUCCESS') {
                currentBarcodes = data.barcodes;
                
                // Set Meta Info
                metaPrefix.textContent = data.prefix;
                metaRange.textContent = `${data.begin} - ${data.end}`;
                metaCount.textContent = data.count;
                
                // Render List with Pagination
                currentPage = 1;
                renderTable(currentPage);
                
                // Show Result Card with animation
                resultSection.classList.remove('hidden');
                resultSection.classList.remove('fade-in');
                void resultSection.offsetWidth; // trigger reflow to restart animation
                resultSection.classList.add('fade-in');
                showToast('ดึงข้อมูลบาร์โค้ดสำเร็จ!', '#34c759');
                
                // Auto-update status to green if it succeeded
                updateStatusUI(typ, 'SUCCESS');
                sortStatusList();
            } else {
                alert(`เกิดข้อผิดพลาด: ${data.message}`);
                // Auto-update status to red if it failed due to permission
                updateStatusUI(typ, 'ERROR');
                sortStatusList();
            }
        } catch (error) {
            console.error('Request failed:', error);
            alert('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
        } finally {
            // Hide Loading
            submitBtn.disabled = false;
            submitBtnText.textContent = 'ดึงเลขบาร์โค้ด';
            spinner.classList.add('hidden');
        }
    });

    // Helper to update Status UI
    function updateStatusUI(typ, statusResult) {
        const item = document.getElementById(`status-typ-${typ}`);
        if (!item) return;
        
        const dot = item.querySelector('.indicator-dot');
        const tag = item.querySelector('.status-tag');
        
        if (statusResult === 'SUCCESS') {
            item.classList.remove('disabled-status');
            dot.className = 'indicator-dot blink-green';
            tag.className = 'status-tag tag-success';
            tag.textContent = 'พร้อมใช้';
        } else {
            item.classList.add('disabled-status');
            dot.className = 'indicator-dot blink-red';
            tag.className = 'status-tag tag-danger';
            tag.textContent = 'ไม่มีสิทธิ์';
        }
    }

    // Helper to sort Status List (Ready first)
    function sortStatusList() {
        const statusList = document.querySelector('.status-list');
        if (!statusList) return;
        
        const items = Array.from(statusList.children);
        items.sort((a, b) => {
            const aReady = a.classList.contains('disabled-status') ? 1 : 0;
            const bReady = b.classList.contains('disabled-status') ? 1 : 0;
            // Additional sort logic to keep numerical order if both are in same state
            if (aReady === bReady) {
                const aId = parseInt(a.id.replace('status-typ-', '')) || 999;
                const bId = parseInt(b.id.replace('status-typ-', '')) || 999;
                return aId - bId;
            }
            return aReady - bReady;
        });
        
        items.forEach(item => statusList.appendChild(item));
    }

    // Function to perform status check
    async function performCheckStatus(force = false) {
        try {
            const url = force ? '/api/check-status?force=true' : '/api/check-status';
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.status === 'SUCCESS') {
                const types = [1, 2, 5, 8, 9, 11, 20, 21];
                types.forEach(typ => {
                    const status = data.data[typ];
                    updateStatusUI(typ, status);
                    
                    // Update Dropdown Option
                    const option = document.getElementById(`opt-typ-${typ}`);
                    if (option) {
                        if (status === 'SUCCESS') {
                            option.removeAttribute('disabled');
                        } else {
                            option.setAttribute('disabled', 'disabled');
                        }
                    }
                });
                
                // Sort list after checking all
                sortStatusList();
                
                if (force) {
                    showToast('รีเช็คสถานะสำเร็จ!', '#34c759');
                }
            } else {
                if (force) alert('เกิดข้อผิดพลาดในการดึงสถานะ');
            }
        } catch (err) {
            console.error(err);
            if (force) alert('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์เพื่อเช็คสถานะได้');
        }
    }

    // Auto-check on load
    performCheckStatus(false);

    // Handle Re-check Button
    const recheckBtn = document.getElementById('recheck-status-btn');
    if (recheckBtn) {
        recheckBtn.addEventListener('click', async () => {
            const originalHTML = recheckBtn.innerHTML;
            recheckBtn.innerHTML = '<span class="spin-icon">🔄</span> กำลังเช็ค...';
            recheckBtn.disabled = true;
            
            await performCheckStatus(true);
            
            recheckBtn.innerHTML = originalHTML;
            recheckBtn.disabled = false;
        });
    }

    // Handle Copy Single Barcode
    barcodeList.addEventListener('click', (e) => {
        if (e.target.classList.contains('copy-single')) {
            const btn = e.target;
            const barcode = btn.getAttribute('data-barcode');
            navigator.clipboard.writeText(barcode)
                .then(() => {
                    const originalText = btn.textContent;
                    btn.textContent = '✅ คัดลอกแล้ว!';
                    btn.classList.add('copy-success');
                    showToast('คัดลอกรหัสแล้ว!');
                    
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.classList.remove('copy-success');
                    }, 2000);
                })
                .catch(err => {
                    console.error('Copy failed:', err);
                });
        }
    });

    // Copy All Barcodes
    copyAllBtn.addEventListener('click', () => {
        if (currentBarcodes.length === 0) return;
        
        const barcodesText = currentBarcodes.map(item => item.barcode).join('\n');
        navigator.clipboard.writeText(barcodesText)
            .then(() => {
                const originalHTML = copyAllBtn.innerHTML;
                copyAllBtn.innerHTML = '<span class="btn-icon">✅</span> คัดลอกแล้ว!';
                copyAllBtn.classList.add('copy-success');
                showToast('คัดลอกรหัสทั้งหมดเรียบร้อย!');
                
                setTimeout(() => {
                    copyAllBtn.innerHTML = originalHTML;
                    copyAllBtn.classList.remove('copy-success');
                }, 2000);
            })
            .catch(err => {
                console.error('Copy failed:', err);
            });
    });

    // Download as .txt file
    downloadTxtBtn.addEventListener('click', () => {
        if (currentBarcodes.length === 0) return;
        
        const content = currentBarcodes.map(item => item.barcode).join('\r\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `barcodes_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Download as .csv file
    downloadCsvBtn.addEventListener('click', () => {
        if (currentBarcodes.length === 0) return;
        
        // CSV BOM (Thai support in Excel)
        let csvContent = '\uFEFF';
        csvContent += 'ลำดับ,หมายเลข Serial,Check Digit,หมายเลขบาร์โค้ด\r\n';
        
        currentBarcodes.forEach((item, index) => {
            csvContent += `${index + 1},${item.serial},${item.checkDigit},${item.barcode}\r\n`;
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `barcodes_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Helper Toast Notification
    function showToast(message, bgColor = '#34c759') {
        toast.textContent = message;
        toast.style.background = bgColor;
        toast.classList.remove('hidden');
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.classList.add('hidden');
            }, 300);
        }, 2000);
    }

    // Fetch and display version
    async function fetchVersion() {
        try {
            const res = await fetch('/api/version');
            const data = await res.json();
            if (data.status === 'SUCCESS' && data.version) {
                document.getElementById('app-version').textContent = data.version;
            } else {
                document.getElementById('app-version').textContent = 'Unknown';
            }
        } catch (err) {
            console.error('Failed to fetch version:', err);
            document.getElementById('app-version').textContent = 'Error';
        }
    }
    fetchVersion();
});
