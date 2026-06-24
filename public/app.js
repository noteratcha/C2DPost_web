document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('barcode-form');
    const serviceTypeSelect = document.getElementById('service-type');
    const quantityInput = document.getElementById('quantity');
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

    let currentBarcodes = [];

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
        
        try {
            const response = await fetch(`/api/get-barcodes?typ=${typ}&cnt=${cnt}`);
            const data = await response.json();
            
            if (data.status === 'SUCCESS') {
                currentBarcodes = data.barcodes;
                
                // Set Meta Info
                metaPrefix.textContent = data.prefix;
                metaRange.textContent = `${data.begin} - ${data.end}`;
                metaCount.textContent = data.count;
                
                // Render List
                barcodeList.innerHTML = '';
                currentBarcodes.forEach((item, index) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td data-label="ลำดับ">${index + 1}</td>
                        <td data-label="Serial">${item.serial}</td>
                        <td data-label="Check Digit">${item.checkDigit}</td>
                        <td data-label="บาร์โค้ด"><strong>${item.barcode}</strong></td>
                        <td data-label="จัดการ">
                            <button class="btn-action copy-single" data-barcode="${item.barcode}">คัดลอก</button>
                        </td>
                    `;
                    barcodeList.appendChild(row);
                });
                
                // Show Result Card
                resultSection.classList.remove('hidden');
                showToast('ดึงข้อมูลบาร์โค้ดสำเร็จ!', '#34c759');
            } else {
                alert(`เกิดข้อผิดพลาด: ${data.message}`);
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

    // Handle Copy Single Barcode
    barcodeList.addEventListener('click', (e) => {
        if (e.target.classList.contains('copy-single')) {
            const barcode = e.target.getAttribute('data-barcode');
            navigator.clipboard.writeText(barcode)
                .then(() => {
                    showToast('คัดลอกรหัสแล้ว!');
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
                showToast('คัดลอกรหัสทั้งหมดเรียบร้อย!');
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
});
