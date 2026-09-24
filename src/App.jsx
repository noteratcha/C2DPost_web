import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Navbar from './components/Navbar';
import ExtensionGate from './components/ExtensionGate';
import LoginModal from './components/LoginModal';
import ActionToolbar from './components/ActionToolbar';
import PreviewGrid from './components/PreviewGrid';
import AdminManagementView from './components/AdminManagementView';
import DepositReportView from './components/DepositReportView';
import TrackingInquiryView from './components/TrackingInquiryView';
import DashboardView from './components/DashboardView';
import DepositReportModal from './components/DepositReportModal';
import TrackingTimelineModal from './components/TrackingTimelineModal';
import { parseCsv } from './utils/parseCsv';
import { convertPdfs, exportAllFiles, exportExcel, exportPdf, reconcileRecords, logBarcodesToUseBarcode, updateEparcelStatusInSheet } from './utils/api';
import { fetchBarcodesFromExtension, syncCredentialsToExtension, getExtensionVersion, subscribeExtensionReady, checkExtensionInstalled, checkEarCapability } from './utils/extensionBridge';
import { SPREADSHEET_ID } from './config';
import './App.css';

const STORAGE_USER_KEY = 'c2dpost_web_user';
const STORAGE_THEME_KEY = 'c2dpost_theme';

// Session timeout: 1 hour (3600000 ms)
const SESSION_TIMEOUT_MS = 60 * 60 * 1000;

export default function App() {
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isDemo = urlParams && urlParams.get('demo') === '1';
  const isDemoAdmin = isDemo && (urlParams.get('admin') === '1' || urlParams.get('role') === 'admin');

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
  const [extensionVersion, setExtensionVersion] = useState(() => {
    if (isDemo) return '1.1.0';
    return getExtensionVersion() || '';
  });
  const [user, setUser] = useState(() => {
    if (isDemoAdmin) return 'admin';
    if (isDemo) return 'renu_officer';
    return typeof window !== 'undefined' ? localStorage.getItem(STORAGE_USER_KEY) || '' : '';
  });
  const [activePage, setActivePage] = useState(() => {
    if (typeof window !== 'undefined' && !isDemoAdmin) {
      const pageParam = new URLSearchParams(window.location.search).get('page');
      if (['workspace', 'deposit-report', 'tracking', 'dashboard'].includes(pageParam)) {
        return pageParam;
      }
    }
    if (isDemoAdmin) return 'admin';
    const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_USER_KEY) || '' : '';
    return saved.toLowerCase() === 'admin' ? 'admin' : 'workspace';
  });
  const [selectedTrackingBarcode, setSelectedTrackingBarcode] = useState('');
  const [adminServices, setAdminServices] = useState(null);
  const [people, setPeople] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(true);
  const [sheetError, setSheetError] = useState(false);
  const [isDepositReportOpen, setIsDepositReportOpen] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileNotice, setReconcileNotice] = useState(null);
  const [trackingInfo, setTrackingInfo] = useState(null); // { barcode, receiver, invNo }
  const [earStatus, setEarStatus] = useState('unknown'); // 'connected' | 'outdated' | 'checking' | 'disconnected' | 'error' | 'unknown'

  // Stable identity เพื่อไม่ให้ ExtensionGate effect รี-รันทุก render (บั๊ก #23)
  const handleExtensionUnlocked = useCallback((ver) => {
    setExtensionUnlocked(true);
    if (ver) setExtensionVersion(ver);
  }, []);

  // Global drag prevention to stop browser opening dropped PDFs
  useEffect(() => {
    const handleDragOver = (e) => e.preventDefault();
    const handleDrop = (e) => e.preventDefault();
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Continuous listener & check for Extension presence and version
  useEffect(() => {
    // 1. Initial check
    const currentVer = getExtensionVersion();
    if (currentVer) {
      setExtensionVersion(currentVer);
      setExtensionUnlocked(true);
    } else {
      checkExtensionInstalled(800).then((isOk) => {
        if (isOk) {
          setExtensionUnlocked(true);
          const v = getExtensionVersion();
          if (v) setExtensionVersion(v);
        }
      });
    }

    // 2. Event listener for C2DPOST_EXTENSION_READY
    const unsub = subscribeExtensionReady((detail) => {
      setExtensionUnlocked(true);
      const v = detail?.version || getExtensionVersion();
      if (v) setExtensionVersion(v);
    });

    // 3. Listener for C2DPOST_PONG
    const handlePong = (e) => {
      if (e.data && e.data.type === 'C2DPOST_PONG') {
        setExtensionUnlocked(true);
        if (e.data.version) {
          setExtensionVersion(e.data.version);
        } else {
          const v = getExtensionVersion();
          if (v) setExtensionVersion(v);
        }
      }
    };
    window.addEventListener('message', handlePong);

    return () => {
      unsub();
      window.removeEventListener('message', handlePong);
    };
  }, []);

  // e-AR connection status check
  const earCheckIntervalRef = useRef(null);
  const checkEarConnection = useCallback(async () => {
    try {
      const cap = await checkEarCapability(1000);
      console.log('[e-AR Status Check] Result:', cap);
      if (cap.installed && cap.supported) {
        setEarStatus('connected');
      } else if (cap.installed && !cap.supported) {
        setEarStatus('outdated');
      } else {
        setEarStatus('disconnected');
      }
    } catch (err) {
      console.error('[e-AR Status Check] Unexpected error:', err);
      setEarStatus('error');
    }
  }, []);

  useEffect(() => {
    // Initial check
    checkEarConnection();
    // Check every 30 seconds
    earCheckIntervalRef.current = setInterval(checkEarConnection, 30000);
    return () => {
      if (earCheckIntervalRef.current) {
        clearInterval(earCheckIntervalRef.current);
      }
    };
  }, [checkEarConnection]);

  // Workspace Drag & Drop State
  const [isWorkspaceDragOver, setIsWorkspaceDragOver] = useState(false);
  const workspaceDragCounterRef = useRef(0);
  // Synchronous lock เพื่อกัน drop/เลือกไฟล์ซ้อนกันระหว่างกำลังประมวลผล (บั๊ก #18)
  const uploadLockRef = useRef(false);

  // App Main State
  const [selectedFiles, setSelectedFiles] = useState(() => {
    if (isDemo) return [
      'SVARADMServlert(ที่ดินเรณูนคร).pdf',
      'ตัวอย่างเอกสาร_ที่สแกนไม่ชัด(ล้มเหลว).pdf'
    ];
    return [];
  });
  const [fileStatuses, setFileStatuses] = useState(() => {
    if (isDemo) {
      return {
        'SVARADMServlert(ที่ดินเรณูนคร).pdf': {
          status: 'success',
          recordCount: 3,
          message: 'แปลงข้อมูลสำเร็จ (3 รายการ)'
        },
        'ตัวอย่างเอกสาร_ที่สแกนไม่ชัด(ล้มเหลว).pdf': {
          status: 'error',
          error: 'ไม่พบตารางข้อมูลในไฟล์ PDF หรือข้อความในเอกสารถูกเข้ารหัส',
          recordCount: 0
        }
      };
    }
    return {};
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

  // Handle Logout with complete session cleanup
  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_USER_KEY);
    sessionStorage.removeItem('c2dpost_deposit_report_cache');
    sessionStorage.removeItem('c2dpost_date_range_cache');
    sessionStorage.removeItem('c2dpost_dashboard_cache');
    syncCredentialsToExtension('', '', '');
    setUser('');
    setActivePage('workspace');
    setSelectedFiles([]);
    setFileStatuses({});
    setRecords([]);
    setStatusText('ยังไม่ได้เลือกไฟล์');
    setProgress(null);
  }, []);

  // Session timeout: auto-logout after 1 hour of inactivity
  const inactivityTimeoutRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }
    if (user) {
      inactivityTimeoutRef.current = setTimeout(() => {
        handleLogout();
        alert('เซสชันหมดอายุจากการไม่ได้ใช้งานเกิน 1 ชั่วโมง กรุณาเข้าสู่ระบบใหม่');
      }, SESSION_TIMEOUT_MS);
    }
  }, [user, handleLogout]);

  useEffect(() => {
    if (!user) return;

    const events = ['mousedown', 'keydown', 'click', 'scroll', 'touchstart'];
    const handler = () => resetInactivityTimer();

    events.forEach((evt) => window.addEventListener(evt, handler, { passive: true }));
    resetInactivityTimer();

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handler));
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
    };
  }, [user, resetInactivityTimer]);

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
    if (isDemoAdmin) {
      return {
        UserName: 'admin',
        Password: 'admin_password',
        Prefix: 'ADM',
        Organization: 'ส่วน ทข.ปข.10 (ผู้ดูแลระบบกลาง)',
        Status: 'ADMIN'
      };
    }
    if (isDemo) {
      return {
        UserName: 'renu_officer',
        Password: 'demo_password',
        Prefix: 'RN',
        Organization: 'สำนักงานที่ดินจังหวัดนครพนม สาขาเรณูนคร',
        Status: 'DOL'
      };
    }
    return people.find((p) => (p.UserName || '').toLowerCase() === (user || '').toLowerCase()) || null;
  }, [people, user, isDemo, isDemoAdmin]);

  const isAdmin = useMemo(() => {
    if ((user || '').toLowerCase() === 'admin') return true;
    const status = (currentPerson?.Status || '').trim().toUpperCase();
    return status === 'ADMIN' || status === 'ADMINISTRATOR';
  }, [user, currentPerson]);

  // Enforce admin to stay in admin management view
  useEffect(() => {
    if (isAdmin && activePage !== 'admin') {
      setActivePage('admin');
    }
  }, [isAdmin, activePage]);

  // Synchronize credentials to Chrome extension whenever currentPerson is resolved
  useEffect(() => {
    if (user && currentPerson?.UserName) {
      syncCredentialsToExtension(
        currentPerson.UserName,
        currentPerson.Password || '',
        currentPerson.Organization || ''
      );
    }
  }, [user, currentPerson]);

  const handleLogin = (username, personData) => {
    localStorage.setItem(STORAGE_USER_KEY, username);
    setUser(username);
    syncCredentialsToExtension(
      username,
      personData?.Password || '',
      personData?.Organization || ''
    );
    const status = (personData?.Status || '').trim().toUpperCase();
    if (username.toLowerCase() === 'admin' || status === 'ADMIN' || status === 'ADMINISTRATOR') {
      setActivePage('admin');
    } else {
      setActivePage('workspace');
    }
  };

  // 1. Handle File Selection and Parsing
  const handleFilesSelected = async (fileList) => {
    // Guard: ปฏิเสธถ้ามีการแปลงไฟล์กำลังทำงานอยู่ (ป้องกัน upload ชนกันทุกรูปแบบ drop)
    if (uploadLockRef.current) {
      alert('กำลังประมวลผลไฟล์อยู่ กรุณารอให้เสร็จก่อนจึงเลือกไฟล์ใหม่');
      return;
    }

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

    if (isProcessing) {
      alert('กำลังประมวลผลไฟล์อยู่ กรุณารอให้เสร็จก่อน');  // ซ้ำซ้อนกับ ref แต่กัน UI path ที่ยังอ่าน state ค้าง
      return;
    }

    uploadLockRef.current = true;
    setIsProcessing(true);
    setProgress({ val: 0, current: 0, total: newFiles.length, percent: 0 });
    setStatusText(`กำลังแปลงไฟล์... 0/${newFiles.length} (0.00%)`);

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

        const addedStatusMap = {};
        newFiles.forEach((f) => {
          const name = f.name;
          const errObj = (result.error_files || []).find((ef) => ef.filename === name);
          const count = formattedNewRecords.filter((r) => r.SOURCE_FILE === name).length;

          if (errObj) {
            addedStatusMap[name] = {
              status: 'error',
              error: errObj.error || 'เกิดข้อผิดพลาดในการประมวลผล',
              recordCount: 0
            };
          } else if (count > 0) {
            addedStatusMap[name] = {
              status: 'success',
              recordCount: count,
              message: `แปลงข้อมูลสำเร็จ (${count} รายการ)`
            };
          } else {
            addedStatusMap[name] = {
              status: 'error',
              error: 'ไม่พบรายการข้อมูลในไฟล์ หรือรูปแบบไม่ตรงกับมาตรฐาน',
              recordCount: 0
            };
          }
        });

        // ใช้ functional updates เพื่อไม่พึ่ง stale closure จาก render เดิม (กันข้อมูลทับกัน)
        setSelectedFiles(prevFiles => [...prevFiles, ...newFiles]);
        setFileStatuses(prevStatus => ({ ...prevStatus, ...addedStatusMap }));
        setRecords((prevRecords) => {
          const combined = [...prevRecords, ...formattedNewRecords].map((r, i) => ({ ...r, NO: i + 1 }));
          return combined;
        });
        setProgress(null);
        setStatusText(`ประมวลผลเสร็จสิ้น รวมทั้งหมด ${records.length + formattedNewRecords.length} รายการ`);

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
      uploadLockRef.current = false;
      setIsProcessing(false);
    }
  };

  // Workspace Drag and Drop Event Handlers
  const handleWorkspaceDragEnter = useCallback((e) => {
    e.preventDefault();
    if (activePage !== 'workspace') return;
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      workspaceDragCounterRef.current += 1;
      if (workspaceDragCounterRef.current === 1) {
        setIsWorkspaceDragOver(true);
      }
    }
  }, [activePage]);

  const handleWorkspaceDragLeave = useCallback((e) => {
    e.preventDefault();
    if (activePage !== 'workspace') return;
    workspaceDragCounterRef.current -= 1;
    if (workspaceDragCounterRef.current <= 0) {
      workspaceDragCounterRef.current = 0;
      setIsWorkspaceDragOver(false);
    }
  }, [activePage]);

  const handleWorkspaceDragOver = useCallback((e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleWorkspaceDrop = useCallback((e) => {
    e.preventDefault();
    workspaceDragCounterRef.current = 0;
    setIsWorkspaceDragOver(false);
    if (activePage !== 'workspace') return;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  }, [activePage, handleFilesSelected]);

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
      let bridgeError = null;
      // ดึงจาก extension เต็มเวลาตาม timeout ของ bridge (20s) ได้เอง
      // ไม่ใช้ Promise.race ตัดเอง 1.5s ซึ่งทำให้ extension ที่ช้าแต่ทำงานปกติถูกตัดทิ้งแล้วสร้างเลขปลอม
      try {
        const extRes = await fetchBarcodesFromExtension(numRecords, 2);
        if (extRes && extRes.success && extRes.barcodes && extRes.barcodes.length > 0) {
          barcodes = extRes.barcodes;
        }
      } catch (bridgeErr) {
        bridgeError = bridgeErr;
        if (isDemo) {
          // โหมดสาธิตเท่านั้น: สร้างเลขจำลองให้ทดสอบ UI ได้โดยไม่ต้องพึ่งไปรษณีย์
          const prefix = 'RE';
          const start = 518924000 + Math.floor(Math.random() * 9000);
          for (let i = 0; i < numRecords; i++) {
            barcodes.push(`${prefix}${start + i}TH`);
          }
        }
      }

      // ไม่มีบาร์โค้ดจริงในโหมดใช้งานจริง → ยกเลิกเลย อย่าปล่อยเลขปลอมเข้าระบบ
      if (barcodes.length === 0) {
        throw new Error(bridgeError?.message || 'ไม่สามารถดึงหมายเลขบาร์โค้ดจากส่วนขยายได้ กรุณาลองใหม่อีกครั้ง');
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

      // บันทึกประวัติการใช้บาร์โค้ดลง Google Sheet (UseBarcode) ให้ตรงกับระบบ Python Desktop
      const username = currentPerson?.UserName || user || 'Unknown';
      const logItems = [];
      missingIndices.forEach((recordIdx, i) => {
        if (i < barcodes.length) {
          const row = records[recordIdx];
          const receiver = String(row.RECEIVER || row['RECEIVER'] || '').trim();
          const address = String(row.RECEIVER_ADDRESS || row['RECEIVER ADDRESS'] || '').trim();
          const amphur = String(row.RECEIVER_AMPHUR || row['RECEIVER AMPHUR'] || '').trim();
          const prov = String(row.RECEIVER_PROVINCE || row['RECEIVER PROVINCE'] || '').trim();
          const zip = String(row.RECEIVER_ZIPCODE || row['RECEIVER ZIPCODE'] || '').trim();
          const details = [receiver, address, amphur, prov, zip].filter(Boolean).join(' ');

          logItems.push({
            barcode: barcodes[i],
            details: details,
            username: username
          });
        }
      });

      if (logItems.length > 0) {
        logBarcodesToUseBarcode(logItems, username)
          .then((res) => {
            if (res && res.success) {
              console.log(`[UseBarcode] บันทึกประวัติสำเร็จ ${res.logged_count} รายการ`);
            } else {
              console.warn('[UseBarcode] บันทึกประวัติไม่สำเร็จ:', res);
            }
          })
          .catch((err) => console.warn('[UseBarcode] Error:', err));
      }

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
    // ใช้วันตามเวลาประเทศไทย (Asia/Bangkok) ไม่ใช่ UTC — ก่อนเที่ยงคืน/เช้าตรู่เลข manifest ต้องเป็นวันเดียวกันกับผู้ใช้
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).replace(/-/g, '');
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
        shipperDistrict: String(row.SHIPPER_AMPHUR || (currentPerson?.ResponsiblePostoffice ? currentPerson.ResponsiblePostoffice.replace(/^ปณ\./, '') : '') || '').trim(),
        shipperProvince: String(row.SHIPPER_PROVINCE || (currentPerson?.Organization && currentPerson.Organization.includes('นครพนม') ? 'นครพนม' : '') || '').trim(),
        shipperZipcode: String(row.SHIPPER_ZIPCODE || currentPerson?.ResponsibleZipcode || '').trim(),
        shipperMobile: shipperTel || String(currentPerson?.TelContactPerson1 || '0000000000').replace(/\D/g, '').padEnd(10, '0').slice(0, 10),
        shipperEmail: String(row.SHIPPER_EMAIL || currentPerson?.Email || '').trim(),
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

      // ถึงจุดนี้ระบบยอมรับคำขอแล้ว (200/0) จึงเบิร์นเลข manifest
      setManifestCounter(prev => prev + 1);

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

      // อัปเดตคอลัมน์ E "ส่งข้อมูล e-Parcel" เป็น "yes" ในชีต UseBarcode สำหรับหมายเลขที่ส่งสำเร็จ
      const successfulBarcodes = sentBarcodes.filter(b => !errorMap[b]);
      if (successfulBarcodes.length > 0) {
        updateEparcelStatusInSheet(successfulBarcodes, 'yes')
          .then(res => console.log('[UseBarcode] บันทึกคอลัมน์ E "ส่งข้อมูล e-Parcel" = yes สำเร็จ:', successfulBarcodes))
          .catch(err => console.warn('[UseBarcode] อัปเดตสถานะ e-Parcel ไม่สำเร็จ:', err));
      }

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
        updateEparcelStatusInSheet(sentBarcodes, 'yes').catch(() => {});
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

  // 4. Handle Download Document (Excel, Combined PDF, Delivery Note, Envelopes, or All 4 Files)
  const handleDownloadDocument = async (docType) => {
    if (records.length === 0) {
      alert('ไม่มีข้อมูลสำหรับดาวน์โหลด');
      return;
    }

    setIsProcessing(true);

    try {
      if (docType === 'excel') {
        setStatusText('กำลังสร้างไฟล์ Excel (สำหรับ DPost)...');
        await exportExcel(records);
        setStatusText('ดาวน์โหลดไฟล์ Excel (สำหรับ DPost) สำเร็จ');
      } else if (docType === 'combined') {
        setStatusText('กำลังสร้างไฟล์ PDF (เอกสารพร้อมบาร์โค้ด)...');
        await exportPdf(records, 'combined', selectedFiles);
        setStatusText('ดาวน์โหลดไฟล์ PDF (เอกสารพร้อมบาร์โค้ด) สำเร็จ');
      } else if (docType === 'delivery_note') {
        setStatusText('กำลังสร้างไฟล์ PDF (ใบนำส่ง)...');
        await exportPdf(records, 'delivery_note');
        setStatusText('ดาวน์โหลดไฟล์ PDF (ใบนำส่ง) สำเร็จ');
      } else if (docType === 'envelopes') {
        const selectedRows = records.filter(r => r.SELECTED === true);
        const target = selectedRows.length > 0 ? selectedRows : records;
        setStatusText(`กำลังสร้างไฟล์ PDF จ่าหน้าซอง (${target.length} รายการ)...`);
        await exportPdf(target, 'envelopes', selectedFiles);
        setStatusText(`ดาวน์โหลดไฟล์ PDF จ่าหน้าซอง (${target.length} รายการ) สำเร็จ`);
      } else if (docType === 'all') {
        setStatusText('กำลังเตรียมดาวน์โหลดเอกสารครบทั้ง 4 ไฟล์...');

        // 1. Excel
        setStatusText('1/4 กำลังสร้างไฟล์ Excel (สำหรับ DPost)...');
        await exportExcel(records);
        await new Promise(r => setTimeout(r, 600));

        // 2. Combined PDF
        setStatusText('2/4 กำลังสร้างไฟล์ PDF (เอกสารพร้อมบาร์โค้ด)...');
        await exportPdf(records, 'combined', selectedFiles);
        await new Promise(r => setTimeout(r, 600));

        // 3. Delivery Note PDF
        setStatusText('3/4 กำลังสร้างไฟล์ PDF (ใบนำส่ง)...');
        await exportPdf(records, 'delivery_note');
        await new Promise(r => setTimeout(r, 600));

        // 4. Envelopes PDF
        const selectedRows = records.filter(r => r.SELECTED === true);
        const target = selectedRows.length > 0 ? selectedRows : records;
        setStatusText(`4/4 กำลังสร้างไฟล์ PDF จ่าหน้าซอง (${target.length} รายการ)...`);
        await exportPdf(target, 'envelopes', selectedFiles);

        setStatusText('ดาวน์โหลดเอกสารครบทั้ง 4 ไฟล์ สำเร็จเรียบร้อยแล้ว');
        alert(
          'ดาวน์โหลดเอกสารครบทั้ง 4 ไฟล์ สำเร็จเรียบร้อยแล้ว!\n\n' +
          '1. ไฟล์ Excel (สำหรับ DPost)\n' +
          '2. ไฟล์ PDF (เอกสารพร้อมบาร์โค้ด)\n' +
          '3. ไฟล์ PDF (ใบนำส่ง)\n' +
          `4. ไฟล์ PDF (จ่าหน้าซอง จำนวน ${target.length} รายการ)`
        );
      }
    } catch (err) {
      console.error('Download error:', err);
      setStatusText('เกิดข้อผิดพลาดในการดาวน์โหลดเอกสาร');
      alert(`ไม่สามารถดาวน์โหลดเอกสารได้:\n${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 4.1 Handle Export Excel, Combined PDF, and Delivery Note (legacy fallback)
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
    setFileStatuses({});
    setRecords([]);
    setReconcileNotice(null);
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
      // Revoke หลังหน้าต่างใหม่โหลดได้แล้ว กันหน่วยความจำรั่ว (บั๊ก #22)
      setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);
    } else {
      alert(`ไฟล์ต้นฉบับ: ${sourceFileName || 'ไม่มีข้อมูลไฟล์'}`);
    }
  };

  // 10. Handle View Tracking Timeline (single barcode) -> Opens dedicated tracking page
  const handleViewTracking = (row) => {
    const barcode = String(row.BARCODE_NO || '').trim();
    if (!barcode) {
      alert("รายการนี้ยังไม่มีหมายเลขบาร์โค้ด กรุณากด 'ดึงหมายเลข' ก่อนครับ");
      return;
    }
    setSelectedTrackingBarcode(barcode);
    setActivePage('tracking');
  };

  // 11. Handle Auto-Reconcile (batch check received status vs post office)
  const handleCheckDeposit = async () => {
    const rowsWithBarcode = records.filter(r => r.BARCODE_NO && String(r.BARCODE_NO).trim() !== '');
    if (rowsWithBarcode.length === 0) {
      alert('ไม่มีรายการที่มีหมายเลขบาร์โค้ด กรุณาดึงหมายเลขก่อนตรวจสอบ');
      return;
    }

    setIsReconciling(true);
    setStatusText(`กำลังตรวจสอบสถานะรับฝาก ${rowsWithBarcode.length} รายการ...`);

    try {
      const username = currentPerson?.UserName || '';
      const password = currentPerson?.Password || '';
      const barcodes = rowsWithBarcode.map(r => String(r.BARCODE_NO).trim());

      const result = await reconcileRecords({ barcodes, username, password });

      if (!result.success) {
        throw new Error(result.message || 'ไม่สามารถตรวจสอบได้');
      }

      // Map received info back onto records
      const resultMap = {};
      (result.results || []).forEach(r => {
        resultMap[String(r.barcode).trim()] = r;
      });

      setRecords(prev => prev.map(row => {
        const bcode = String(row.BARCODE_NO || '').trim();
        const info = resultMap[bcode];
        if (!info) return row;

        if (info.received) {
          return {
            ...row,
            DEPOSIT_STATUS: '✓ รับฝากแล้ว',
            DEPOSIT_RECEIVED: true,
            DEPOSIT_DATE: info.received_date || '',
            DEPOSIT_POSTOFFICE: info.received_postoffice || ''
          };
        }
        return {
          ...row,
          DEPOSIT_STATUS: info.status_description || 'ยังไม่พบการรับฝาก',
          DEPOSIT_RECEIVED: false,
          DEPOSIT_DATE: '',
          DEPOSIT_POSTOFFICE: ''
        };
      }));

      const receivedCount = result.received_count || 0;
      const totalChecked = result.total_checked || rowsWithBarcode.length;
      setStatusText(`ตรวจสอบรับฝากสำเร็จ: รับฝากแล้ว ${receivedCount} / ${totalChecked} รายการ`);

      const validApiNotice = (result.api_notice && !/no receive product|no data/i.test(result.api_notice)) ? result.api_notice : null;

      // Set reconcile notice state for UI banner above table
      setReconcileNotice({
        api_notice: validApiNotice,
        is_mock: Boolean(result.is_mock),
        received_count: receivedCount,
        total_checked: totalChecked
      });

      let alertMsg = `ตรวจสอบสถานะรับฝากเรียบร้อยแล้ว!\n\n` +
        `รายการที่ไปรษณีย์รับฝากแล้ว: ${receivedCount} รายการ\n` +
        `รายการที่ยังไม่รับฝาก: ${totalChecked - receivedCount} รายการ\n\n` +
        `แถวที่รับฝากแล้วจะถูกไฮไลต์สีเขียว`;

      if (validApiNotice) {
        alertMsg += `\n\n⚠️ ข้อสังเกตระบบ e-Parcel:\n${validApiNotice}\n(เซิร์ฟเวอร์อาจไม่สามารถเข้าถึงฐานข้อมูลจริงได้เนื่องจากติดเงื่อนไข IP Whitelist ของไปรษณีย์ไทย)`;
      } else if (result.is_mock) {
        alertMsg += `\n\nℹ️ โหมดสาธิต (Demo Mode): กำลังแสดงผลการตรวจสอบแบบจำลอง`;
      }

      alert(alertMsg);

      if (result.api_notice) {
        console.warn('Reconcile API notice:', result.api_notice);
      }
    } catch (err) {
      console.error('Reconcile error:', err);
      setStatusText('เกิดข้อผิดพลาดในการตรวจสอบรับฝาก');
      alert(`ไม่สามารถตรวจสอบสถานะรับฝากได้:\n${err.message || err}`);
    } finally {
      setIsReconciling(false);
    }
  };

  // Sync deposit status from Deposit Report Modal into main table records
  const handleSyncFromDepositReport = useCallback((depositItems = []) => {
    if (!depositItems || depositItems.length === 0) return;
    
    // Create map of received items
    const receivedMap = new Map();
    depositItems.forEach(item => {
      const bcode = String(item.barcode || '').trim().toUpperCase();
      const isReceived = item.status === '1' || String(item.status_description || '').includes('รับฝาก');
      if (bcode && isReceived) {
        receivedMap.set(bcode, item);
      }
    });

    if (receivedMap.size === 0) return;

    let matchedCount = 0;
    setRecords(prev => prev.map(row => {
      const bcode = String(row.BARCODE_NO || '').trim().toUpperCase();
      const match = receivedMap.get(bcode);
      if (match) {
        matchedCount++;
        return {
          ...row,
          DEPOSIT_STATUS: '✓ รับฝากแล้ว',
          DEPOSIT_RECEIVED: true,
          DEPOSIT_DATE: match.received_date || match.datetime || '',
          DEPOSIT_POSTOFFICE: match.received_postoffice || match.postcode_name || ''
        };
      }
      return row;
    }));

    if (matchedCount > 0) {
      setStatusText(`ซิงก์ผลรับฝากจากรายงานสำเร็จ: พบรับฝากแล้ว ${matchedCount} รายการ (ไฮไลต์แถวสีเขียว)`);
    }
  }, []);

  return (
    <div className="app-layout">
      {/* 1. Chrome Extension Gatekeeper */}
      {!extensionUnlocked && (
        <ExtensionGate 
          onUnlocked={handleExtensionUnlocked} 
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}

      {/* 2. Main Navigation (Python theme with Tab-based Page Routing) */}
      <Navbar 
        user={user} 
        currentPerson={currentPerson} 
        onLogout={handleLogout} 
        extensionInstalled={extensionUnlocked} 
        extensionVersion={extensionVersion}
        theme={theme}
        onToggleTheme={toggleTheme}
        isAdmin={isAdmin}
        activePage={activePage}
        onNavigate={setActivePage}
        adminServices={adminServices}
        onOpenDepositReport={() => setActivePage('deposit-report')}
        earStatus={earStatus}
        onRefreshEar={checkEarConnection}
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

      {/* 4. Dedicated Page Views (Shown ONLY when logged in) */}
      {extensionUnlocked && user && (
        <>
          {/* Page 1: แปลงไฟล์ PDF & ตารางข้อมูล (Workspace) */}
          {activePage === 'workspace' && (
            <main 
              className={`main-content python-layout-main ${isWorkspaceDragOver ? 'workspace-drag-active' : ''}`}
              onDragEnter={handleWorkspaceDragEnter}
              onDragOver={handleWorkspaceDragOver}
              onDragLeave={handleWorkspaceDragLeave}
              onDrop={handleWorkspaceDrop}
            >
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
                  onDownloadDocument={handleDownloadDocument}
                  onExportExcel={handleExportExcel}
                  onExportEnvelope={handleExportEnvelope}
                  onSendEparcel={handleSendEparcel}
                  isReconciling={isReconciling}
                  onCheckDeposit={handleCheckDeposit}
                  onOpenDepositReport={() => setActivePage('deposit-report')}
                />

                {/* Card 2: ตารางแสดงข้อมูล */}
                <PreviewGrid 
                  records={records} 
                  selectedFiles={selectedFiles}
                  fileStatuses={fileStatuses}
                  reconcileNotice={reconcileNotice}
                  onDismissReconcileNotice={() => setReconcileNotice(null)}
                  onUpdateRecord={handleUpdateRecord} 
                  onDeleteRecord={handleDeleteRecord} 
                  onClearAll={handleClearAll}
                  onViewPdf={handleViewPdf}
                  onViewTracking={handleViewTracking}
                  onFilesSelected={handleFilesSelected}
                />
              </div>

              {/* Workspace Drag & Drop Overlay */}
              {isWorkspaceDragOver && (
                <div 
                  className="workspace-drop-overlay"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleWorkspaceDrop}
                >
                  <div className="workspace-drop-card">
                    <div className="drop-icon-bounce">
                      <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="12" y1="18" x2="12" y2="12"></line>
                        <polyline points="9 15 12 12 15 15"></polyline>
                      </svg>
                    </div>
                    <h3>วางไฟล์ PDF ที่นี่เพื่อแปลงไฟล์</h3>
                    <p>ปล่อยไฟล์เพื่อเริ่มต้นอ่านข้อมูลคำขอ สนง.ที่ดิน หรือไฟล์ไปรษณีย์</p>
                    <span className="drop-sub-badge">รองรับการเลือกและลากวางหลายไฟล์พร้อมกัน (.pdf)</span>
                  </div>
                </div>
              )}
            </main>
          )}

          {/* Page 2: รายงานการรับฝาก (Deposit Report) */}
          {activePage === 'deposit-report' && (
            <DepositReportView
              currentPerson={currentPerson}
              onSyncRecords={handleSyncFromDepositReport}
              onSwitchToWorkspace={() => setActivePage('workspace')}
              onOpenTrackingPage={(bcode) => {
                setSelectedTrackingBarcode(bcode);
                setActivePage('tracking');
              }}
            />
          )}

          {/* Page 3: ตรวจสอบพัสดุ (Tracking Inquiry) */}
          {activePage === 'tracking' && (
            <TrackingInquiryView
              currentPerson={currentPerson}
              records={records}
              initialBarcode={selectedTrackingBarcode}
              onSwitchToWorkspace={() => setActivePage('workspace')}
            />
          )}

          {/* Page 4: สถิติ & แผนที่การนำจ่าย (Dashboard) */}
          {activePage === 'dashboard' && (
            <DashboardView
              currentPerson={currentPerson}
              onSwitchToWorkspace={() => setActivePage('workspace')}
            />
          )}

          {/* Page 5: จัดการระบบ (Admin Portal) */}
          {activePage === 'admin' && isAdmin && (
            <AdminManagementView
              user={user}
              people={people}
              loadingPeople={loadingSheet}
              onRefreshPeople={loadPeople}
              onLogout={handleLogout}
              onSwitchToWorkspace={() => setActivePage('workspace')}
              onServicesChange={setAdminServices}
            />
          )}
        </>
      )}

      {/* 5. Deposit Report Modal (Fallback compatibility) */}
      <DepositReportModal
        isOpen={isDepositReportOpen}
        onClose={() => setIsDepositReportOpen(false)}
        currentPerson={currentPerson}
        onSyncRecords={handleSyncFromDepositReport}
      />

      {/* 6. Tracking Timeline Modal (Fallback compatibility) */}
      <TrackingTimelineModal
        isOpen={!!trackingInfo}
        barcode={trackingInfo?.barcode || ''}
        recInfo={trackingInfo || null}
        currentPerson={currentPerson}
        onClose={() => setTrackingInfo(null)}
      />
    </div>
  );
}
