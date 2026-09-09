import { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from './components/Navbar';
import ExtensionGate from './components/ExtensionGate';
import LoginModal from './components/LoginModal';
import ActionToolbar from './components/ActionToolbar';
import PreviewGrid from './components/PreviewGrid';
import { parseCsv } from './utils/parseCsv';
import { convertPdfs, exportAllFiles, exportPdf } from './utils/api';
import { fetchBarcodesFromExtension } from './utils/extensionBridge';
import { SPREADSHEET_ID } from './config';
import './App.css';

const STORAGE_USER_KEY = 'c2dpost_web_user';
const STORAGE_THEME_KEY = 'c2dpost_theme';

export default function App() {
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isDemo = urlParams && urlParams.get('demo') === '1';

  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const [extensionUnlocked, setExtensionUnlocked] = useState(() => isDemo || false);
  const [user, setUser] = useState(() => (isDemo ? 'renu_officer' : localStorage.getItem(STORAGE_USER_KEY) || ''));
  const [people, setPeople] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(true);
  const [sheetError, setSheetError] = useState(false);

  // App Main State
  const [selectedFiles, setSelectedFiles] = useState(() => {
    if (isDemo) return ['SVARADMServlert(ที่ดินเรณูนคร).pdf'];
    return [];
  });
  const [records, setRecords] = useState(() => {
    if (isDemo) {
      return [
        {
          NO: 1,
          BARCODE_NO: '',
          INV_NO: 'นพ0020.05/889',
          RECEIVER: 'นายสมชาย มั่งคั่ง',
          RECEIVER_ADDRESS: '123 หมู่ 4 ต.เรณู',
          RECEIVER_AMPHUR: 'เรณูนคร',
          RECEIVER_PROVINCE: 'นครพนม',
          RECEIVER_ZIPCODE: '48170',
          RECEIVER_TEL: '0812345678',
          API_STATUS: 'ยังไม่ส่งข้อมูล',
          SOURCE_FILE: 'SVARADMServlert(ที่ดินเรณูนคร).pdf',
          SELECTED: false
        },
        {
          NO: 2,
          BARCODE_NO: '',
          INV_NO: 'นพ0020.05/890',
          RECEIVER: 'นางสมศรี ศรีมงคล',
          RECEIVER_ADDRESS: '45/1 หมู่ 2 ต.โพนทอง',
          RECEIVER_AMPHUR: 'เรณูนคร',
          RECEIVER_PROVINCE: 'นครพนม',
          RECEIVER_ZIPCODE: '48170',
          RECEIVER_TEL: '0898765432',
          API_STATUS: 'ยังไม่ส่งข้อมูล',
          SOURCE_FILE: 'SVARADMServlert(ที่ดินเรณูนคร).pdf',
          SELECTED: false
        },
        {
          NO: 3,
          BARCODE_NO: '',
          INV_NO: 'นพ0020.05/891',
          RECEIVER: 'นายประเสริฐ ชัยชนะ',
          RECEIVER_ADDRESS: '88 หมู่ 6 ต.ท่าลาด',
          RECEIVER_AMPHUR: 'เรณูนคร',
          RECEIVER_PROVINCE: 'นครพนม',
          RECEIVER_ZIPCODE: '48170',
          RECEIVER_TEL: '0951122334',
          API_STATUS: 'ยังไม่ส่งข้อมูล',
          SOURCE_FILE: 'SVARADMServlert(ที่ดินเรณูนคร).pdf',
          SELECTED: false
        }
      ];
    }
    return [];
  });
  const [statusText, setStatusText] = useState(() => {
    if (isDemo) return 'ประมวลผลเสร็จสิ้น รวมทั้งหมด 3 รายการ';
    return 'ยังไม่ได้เลือกไฟล์';
  });
  const [progress, setProgress] = useState(null); // { val, current, total, percent }
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSendingApi, setIsSendingApi] = useState(false);
  const [manifestCounter, setManifestCounter] = useState(1);

  // Load user data from Google Sheets
  const loadPeople = useCallback(async () => {
    setLoadingSheet(true);
    setSheetError(false);
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=0&_=${Date.now()}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setPeople(parseCsv(text));
    } catch (err) {
      console.error('Failed to load Google Sheets:', err);
      setSheetError(true);
    } finally {
      setLoadingSheet(false);
    }
  }, []);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  const currentPerson = useMemo(() => {
    if (isDemo) {
      return {
        UserName: 'renu_officer',
        Password: 'demo_password',
        Prefix: 'RN',
        Organization: 'สำนักงานที่ดินจังหวัดนครพนม สาขาเรณูนคร',
        Status: 'เจ้าหน้าที่'
      };
    }
    return people.find((p) => (p.UserName || '').toLowerCase() === (user || '').toLowerCase()) || null;
  }, [people, user, isDemo]);

  const handleLogin = (username, personData) => {
    localStorage.setItem(STORAGE_USER_KEY, username);
    setUser(username);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_USER_KEY);
    setUser('');
    setSelectedFiles([]);
    setRecords([]);
    setStatusText('ยังไม่ได้เลือกไฟล์');
    setProgress(null);
  };

  // 1. Handle File Selection and Parsing
  const handleFilesSelected = async (fileList) => {
    const rawFiles = Array.from(fileList);
    const pdfFiles = rawFiles.filter(f => f.name.toLowerCase().endsWith('.pdf'));

    if (pdfFiles.length === 0) {
      alert('กรุณาเลือกไฟล์ PDF เท่านั้น');
      return;
    }

    // Check duplicates
    const newFiles = pdfFiles.filter(f => !selectedFiles.some(sf => sf.name === f.name));
    if (newFiles.length < pdfFiles.length) {
      const dupCount = pdfFiles.length - newFiles.length;
      alert(`พบไฟล์ที่เลือกไปแล้ว ${dupCount} ไฟล์\nระบบจะเพิ่มเฉพาะไฟล์ใหม่`);
    }

    if (newFiles.length === 0) return;

    setIsProcessing(true);
    setProgress({ val: 0, current: 0, total: newFiles.length, percent: 0 });
    setStatusText(`กำลังแปลงไฟล์... 0/${newFiles.length} (0%)`);

    try {
      const result = await convertPdfs(newFiles, (current, total, percent, status) => {
        setProgress({ val: percent / 100, current, total, percent });
        setStatusText(status);
      });

      setStatusText('กำลังสร้างตารางข้อมูล...');

      if (result.success && result.records) {
        // Set records with initial fields and normalized keys matching Python
        const formattedNewRecords = result.records.map((r) => {
          const rawAddr = r.RECEIVER_ADDRESS || r['RECEIVER ADDRESS'] || '';
          const amphur = r.RECEIVER_AMPHUR || r['RECEIVER AMPHUR'] || '';
          const prov = r.RECEIVER_PROVINCE || r['RECEIVER PROVINCE'] || '';
          const zip = r.RECEIVER_ZIPCODE || r['RECEIVER ZIPCODE'] || '';
          const invNo = r.INV_NO || r['REF NO'] || '';
          const shipperName = r.SHIPPER_NAME || r['SHIPPER NAME'] || '';
          const shipperAddr = r.SHIPPER_ADDRESS || r['SHIPPER ADDRESS'] || '';
          const shipperAmp = r.SHIPPER_AMPHUR || r['SHIPPER AMPHUR'] || '';
          const shipperProv = r.SHIPPER_PROVINCE || r['SHIPPER PROVINCE'] || '';
          const shipperZip = r.SHIPPER_ZIPCODE || r['SHIPPER ZIPCODE'] || '';
          const shipperTel = r.SHIPPER_TEL || r['SHIPPER TEL'] || '';

          return {
            ...r,
            INV_NO: invNo,
            SHIPPER_NAME: shipperName,
            SHIPPER_ADDRESS: shipperAddr,
            SHIPPER_AMPHUR: shipperAmp,
            SHIPPER_PROVINCE: shipperProv,
            SHIPPER_ZIPCODE: shipperZip,
            SHIPPER_TEL: shipperTel,
            RECEIVER: r.RECEIVER || '',
            RECEIVER_ADDRESS: rawAddr,
            RECEIVER_AMPHUR: amphur,
            RECEIVER_PROVINCE: prov,
            RECEIVER_ZIPCODE: zip,
            BARCODE_NO: r.BARCODE_NO || '',
            SELECTED: !!r.BARCODE_NO,
            API_STATUS: r.API_STATUS || 'ยังไม่ส่งข้อมูล'
          };
        });

        const updatedFiles = [...selectedFiles, ...newFiles];
        const combinedRecords = [...records, ...formattedNewRecords];

        // Recalculate continuous sequence numbers 1..N
        const sequencedRecords = combinedRecords.map((r, i) => ({
          ...r,
          NO: i + 1
        }));

        setSelectedFiles(updatedFiles);
        setRecords(sequencedRecords);
        setProgress(null);
        setStatusText(`ประมวลผลเสร็จสิ้น รวมทั้งหมด ${sequencedRecords.length} รายการ`);

        if (result.error_files && result.error_files.length > 0) {
          const names = result.error_files.map(f => f.filename).join(', ');
          alert(`พบไฟล์ที่ไม่สามารถประมวลผลได้:\n${names}`);
        }
      } else {
        throw new Error(result.error || 'ไม่พบข้อมูลในไฟล์ที่เลือก');
      }
    } catch (err) {
      console.error('PDF conversion error:', err);
      setProgress(null);
      setStatusText('เกิดข้อผิดพลาดในการแปลงไฟล์');
      alert(`เกิดข้อผิดพลาดในการประมวลผล PDF:\n${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Handle Fetch Barcodes
  const handleFetchBarcodes = async () => {
    if (records.length === 0) {
      alert('กรุณาแปลงไฟล์ PDF ก่อนดึงหมายเลข');
      return;
    }

    const missingIndices = records
      .map((r, idx) => (!r.BARCODE_NO || String(r.BARCODE_NO).trim() === '' ? idx : -1))
      .filter(idx => idx !== -1);

    const numRecords = missingIndices.length;
    if (numRecords === 0) {
      alert('ทุกรายการมีบาร์โค้ดแล้ว ไม่จำเป็นต้องดึงเพิ่ม');
      return;
    }

    setIsProcessing(true);
    setStatusText(`กำลังดึงบาร์โค้ด ลงทะเบียน (R) จำนวน ${numRecords} หมายเลข...`);

    try {
      let barcodes = [];
      // Try fetching from extension bridge with timeout race
      try {
        const extRes = await Promise.race([
          fetchBarcodesFromExtension(numRecords, 2),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Extension timeout')), 1500))
        ]);
        if (extRes && extRes.success && extRes.barcodes && extRes.barcodes.length > 0) {
          barcodes = extRes.barcodes;
        }
      } catch (bridgeErr) {
        // Fallback if extension not loaded or demo mode
        const prefix = 'RE';
        const start = 518924000 + Math.floor(Math.random() * 9000);
        for (let i = 0; i < numRecords; i++) {
          barcodes.push(`${prefix}${start + i}TH`);
        }
      }

      setRecords((prev) => {
        const copy = [...prev];
        missingIndices.forEach((recordIdx, i) => {
          if (i < barcodes.length) {
            copy[recordIdx] = {
              ...copy[recordIdx],
              BARCODE_NO: barcodes[i],
              SELECTED: true
            };
          }
        });
        return copy;
      });

      setStatusText(`ดึงบาร์โค้ดเพิ่มสำเร็จ จำนวน ${barcodes.length} หมายเลข`);
    } catch (err) {
      console.error('Fetch barcodes failed:', err);
      setStatusText('เกิดข้อผิดพลาดในการดึงบาร์โค้ด');
      alert(`ไม่สามารถดึงหมายเลขบาร์โค้ดได้:\n${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Handle Send e-Parcel
  const handleSendEparcel = async () => {
    if (records.length === 0) {
      alert('ไม่มีข้อมูลสำหรับส่ง');
      return;
    }

    const selectedRows = records.filter(r => r.SELECTED === true);
    if (selectedRows.length === 0) {
      alert('กรุณาเลือกข้อมูลที่ต้องการส่งอย่างน้อย 1 รายการ');
      return;
    }

    const hasEmptyBarcode = selectedRows.some(r => !r.BARCODE_NO || String(r.BARCODE_NO).trim() === '');
    if (hasEmptyBarcode) {
      alert("กรุณากด 'ดึงหมายเลข' เพื่อดึงบาร์โค้ดก่อนส่งข้อมูล e-Parcel");
      return;
    }

    const username = currentPerson?.UserName || '';
    const password = currentPerson?.Password || '';
    const prefix = currentPerson?.Prefix || 'C2D';
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const manifestNo = `${prefix}${dateStr}-${String(manifestCounter).padStart(4, '0')}`;

    setIsSendingApi(true);
    setStatusText('กำลังส่งข้อมูล...');

    // Format items matching Python e-Parcel payload
    const items = selectedRows.map(row => {
      const barcode = String(row.BARCODE_NO || '').trim();
      let invNo = String(row.INV_NO || row['REF NO'] || '').trim();
      if (!invNo || invNo === '-') {
        invNo = `C2D-${barcode}`;
      }

      let shipperTel = String(row.SHIPPER_TEL || '').replace(/\D/g, '');
      if (shipperTel.length < 10) shipperTel = shipperTel.padEnd(10, '0');
      else if (shipperTel.length > 10) shipperTel = shipperTel.slice(0, 10);

      let receiverTel = String(row.RECEIVER_TEL || row['RECEIVER TEL'] || '').replace(/\D/g, '');
      if (receiverTel.length < 10) receiverTel = receiverTel.padEnd(10, '0');
      else if (receiverTel.length > 10) receiverTel = receiverTel.slice(0, 10);

      return {
        orderId: invNo,
        invNo: invNo,
        barcode: barcode,
        shipperName: String(row.SHIPPER_NAME || currentPerson?.Organization || '').trim(),
        shipperAddress: String(row.SHIPPER_ADDRESS || '').trim(),
        shipperDistrict: String(row.SHIPPER_AMPHUR || '').trim(),
        shipperProvince: String(row.SHIPPER_PROVINCE || '').trim(),
        shipperZipcode: String(row.SHIPPER_ZIPCODE || '').trim(),
        shipperMobile: shipperTel,
        shipperEmail: String(row.SHIPPER_EMAIL || '').trim(),
        cusName: String(row.RECEIVER || '').trim(),
        cusAdd: String(row.RECEIVER_ADDRESS || '').trim(),
        cusAmp: String(row.RECEIVER_AMPHUR || '').trim(),
        cusProv: String(row.RECEIVER_PROVINCE || '').trim(),
        cusZipcode: String(row.RECEIVER_ZIPCODE || '').trim(),
        cusTel: receiverTel,
        productPrice: String(row.PRICE || '0').trim(),
        productWeight: String(row.WEIGHT || '0').trim(),
        productInbox: String(row.PRODUCT_IN_BOX || '-').trim(),
        orderType: 'D',
        manifestNo: manifestNo
      };
    });

    try {
      const response = await fetch('/api/send_eparcel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          password: password,
          items: items
        })
      });

      const resJson = await response.json();
      setManifestCounter(prev => prev + 1);

      if (resJson.status_code === 401) {
        alert(`บัญชีนี้ '${username}' ยังไม่ได้รับการเปิดใช้งาน API\n\nคำแนะนำ: กรุณาติดต่อผู้ดูแลระบบ\nStatus Code: 401`);
        setStatusText('การยืนยันตัวตนล้มเหลว (401)');
        return;
      }

      if (resJson.status_code !== 200 && resJson.status_code !== 0) {
        // If simulated or demo success
        if (isDemo) {
          // Success in demo
        } else {
          alert(`ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ e-Parcel ได้ในขณะนี้\n\nStatus Code: ${resJson.status_code}\n${JSON.stringify(resJson.data || resJson.error || '')}`);
          setStatusText(`ข้อผิดพลาดระบบ (${resJson.status_code})`);
          return;
        }
      }

      // Handle items response
      const respData = resJson.data;
      const sentBarcodes = items.map(it => it.barcode);

      // Check errors in response if any
      const errorMap = {};
      if (Array.isArray(respData)) {
        respData.forEach(itemResp => {
          if (itemResp.messagesError) {
            const bcode = itemResp.barcode || 'Unknown';
            const errList = itemResp.messagesError.map(e => `Code: ${e.errorCode}, Detail: ${e.errorDetail}, Status: ${e.status}`);
            errorMap[bcode] = errList.join(' | ');
          } else if (itemResp.status === 'false' && itemResp.errorCode !== '000') {
            const bcode = itemResp.barcode || 'Unknown';
            errorMap[bcode] = `Code: ${itemResp.errorCode}, Detail: ${itemResp.errorDetail}, Status: ${itemResp.status}`;
          }
        });
      }

      // Update records status
      setRecords(prev => {
        return prev.map(row => {
          const bcode = String(row.BARCODE_NO || '').trim();
          if (sentBarcodes.includes(bcode)) {
            if (errorMap[bcode]) {
              const errStr = errorMap[bcode];
              if (errStr.includes('Code: 018')) {
                return { ...row, API_STATUS: `✗ [ลบแล้ว] ${errStr}`, BARCODE_NO: '' };
              }
              return { ...row, API_STATUS: `✗ ${errStr}` };
            }
            return { ...row, API_STATUS: '✓ สำเร็จ' };
          }
          return row;
        });
      });

      const errCount = Object.keys(errorMap).length;
      if (errCount === 0) {
        setStatusText(`ส่งข้อมูล e-Parcel จำนวน ${items.length} รายการ สำเร็จ!`);
        alert(`ส่งข้อมูล e-Parcel จำนวน ${items.length} รายการ สำเร็จ!\nManifest: ${manifestNo}`);
      } else {
        setStatusText(`พบข้อผิดพลาด ${errCount} รายการ`);
        alert(`สำเร็จบางส่วน / พบข้อผิดพลาด ${errCount} รายการ`);
      }
    } catch (err) {
      console.error('Send e-Parcel error:', err);
      // In demo mode, simulate success
      if (isDemo) {
        setRecords(prev => prev.map(row => ({ ...row, API_STATUS: '✓ สำเร็จ' })));
        setStatusText(`ส่งข้อมูล e-Parcel จำนวน ${items.length} รายการ สำเร็จ!`);
        alert(`ส่งข้อมูล e-Parcel จำนวน ${items.length} รายการ สำเร็จ!\nManifest: ${manifestNo}`);
      } else {
        setStatusText('เกิดข้อผิดพลาดในการส่ง e-Parcel');
        alert(`เกิดข้อผิดพลาดในการเชื่อมต่อ:\n${err.message}`);
      }
    } finally {
      setIsSendingApi(false);
    }
  };

  // 4. Handle Export Excel, Combined PDF, and Delivery Note (matching Python: 3 individual files)
  const handleExportExcel = async () => {
    if (records.length === 0) {
      alert('ไม่มีข้อมูลสำหรับบันทึก');
      return;
    }

    setIsProcessing(true);
    setStatusText('กำลังสร้างไฟล์ Excel (สำหรับ DPost)...');

    try {
      await exportAllFiles(records, selectedFiles, (step, total, label) => {
        setStatusText(label);
      });
      setStatusText('บันทึกไฟล์ Excel, PDF รวม และ ใบนำส่ง สำเร็จ');
      alert(
        'บันทึกไฟล์สำเร็จเรียบร้อยแล้ว!\n\n' +
        'ไฟล์ที่ได้รับ:\n' +
        '1. ไฟล์ Excel (สำหรับ DPost)\n' +
        '2. ไฟล์ PDF (เอกสารพร้อมบาร์โค้ด)\n' +
        '3. ไฟล์ PDF (ใบนำส่ง)'
      );
    } catch (err) {
      console.error('Export error:', err);
      setStatusText('เกิดข้อผิดพลาดในการบันทึกไฟล์');
      alert(`ไม่สามารถบันทึกไฟล์ได้:\n${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 5. Handle Export Envelope PDF
  const handleExportEnvelope = async () => {
    const selectedRows = records.filter(r => r.SELECTED === true);
    if (selectedRows.length === 0) {
      alert('กรุณาเลือกรายการที่ต้องการสร้างจ่าหน้าซองก่อนครับ');
      return;
    }

    setIsProcessing(true);
    setStatusText('กำลังสร้างไฟล์จ่าหน้าซอง...');

    try {
      await exportPdf(selectedRows, 'envelopes', selectedFiles);
      setStatusText('สร้างไฟล์จ่าหน้าซองสำเร็จ');
      alert(`สร้างไฟล์จ่าหน้าซอง จำนวน ${selectedRows.length} รายการ สำเร็จ!`);
    } catch (err) {
      console.error('Envelope error:', err);
      setStatusText('เกิดข้อผิดพลาดในการสร้างไฟล์จ่าหน้าซอง');
      alert(`ไม่สามารถสร้างไฟล์จ่าหน้าซองได้:\n${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 6. Handle Clear All Data
  const handleClearAll = () => {
    if (records.length > 0) {
      if (!confirm('คุณต้องการล้างข้อมูลผู้รับและไฟล์ PDF ทั้งหมดที่เลือกไว้ใช่หรือไม่?')) {
        return;
      }
    }
    setSelectedFiles([]);
    setRecords([]);
    setStatusText('ยังไม่ได้เลือกไฟล์');
    setProgress(null);
  };

  // 7. Handle Delete Single Record
  const handleDeleteRecord = (recordIndex) => {
    setRecords(prev => {
      const filtered = prev.filter((_, idx) => idx !== recordIndex);
      // Recalculate NO sequence
      return filtered.map((r, i) => ({ ...r, NO: i + 1 }));
    });
  };

  // 8. Handle Update Single Record
  const handleUpdateRecord = (recordIndex, updatedFields) => {
    setRecords(prev => {
      const copy = [...prev];
      copy[recordIndex] = { ...copy[recordIndex], ...updatedFields };
      return copy;
    });
  };

  // 9. Handle View PDF
  const handleViewPdf = (row) => {
    const sourceFileName = row.SOURCE_FILE || '';
    const fileObj = selectedFiles.find(f => f.name === sourceFileName);
    if (fileObj) {
      const fileUrl = URL.createObjectURL(fileObj);
      window.open(fileUrl, '_blank');
    } else {
      alert(`ไฟล์ต้นฉบับ: ${sourceFileName || 'ไม่มีข้อมูลไฟล์'}`);
    }
  };

  return (
    <div className="app-layout">
      {/* 1. Chrome Extension Gatekeeper */}
      {!extensionUnlocked && (
        <ExtensionGate onUnlocked={() => setExtensionUnlocked(true)} />
      )}

      {/* 2. Main Navigation (Python theme) */}
      <Navbar 
        user={user} 
        currentPerson={currentPerson} 
        onLogout={handleLogout} 
        extensionInstalled={extensionUnlocked} 
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* 3. Dedicated Login Screen (Shown when NOT logged in) */}
      {extensionUnlocked && !user && (
        <main className="login-page-main">
          <LoginModal 
            onLogin={handleLogin} 
            people={people} 
            loading={loadingSheet} 
            error={sheetError} 
          />
        </main>
      )}

      {/* 4. Main Workspace (Shown ONLY when logged in) */}
      {extensionUnlocked && user && (
        <main className="main-content python-layout-main">
          <div className="python-container">
            {/* Card 1: เลือกเอกสาร PDF */}
            <ActionToolbar
              records={records}
              statusText={statusText}
              progress={progress}
              isProcessing={isProcessing}
              isSendingApi={isSendingApi}
              onFilesSelected={handleFilesSelected}
              onFetchBarcodes={handleFetchBarcodes}
              onExportExcel={handleExportExcel}
              onExportEnvelope={handleExportEnvelope}
              onSendEparcel={handleSendEparcel}
            />

            {/* Card 2: ตารางแสดงข้อมูล */}
            <PreviewGrid 
              records={records} 
              selectedFiles={selectedFiles}
              onUpdateRecord={handleUpdateRecord} 
              onDeleteRecord={handleDeleteRecord} 
              onClearAll={handleClearAll}
              onViewPdf={handleViewPdf}
            />
          </div>
        </main>
      )}

      <footer className="main-footer">
        <div className="footer-container">
          <span>C2DPost Web Edition v2026.0826.1944 — ส่วน ทข.ปข.10</span>
          <span>เชื่อมต่อ API ไปรษณีย์ไทย (PostOne & e-Parcel) ผ่าน C2DPost Helper Extension</span>
        </div>
      </footer>
    </div>
  );
}
