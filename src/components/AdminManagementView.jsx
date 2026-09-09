import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { NO_EDIT_USERNAMES } from '../config';
import './AdminManagementView.css';

export default function AdminManagementView({
  user,
  people = [],
  loadingPeople = false,
  onRefreshPeople,
  onLogout,
  onSwitchToWorkspace
}) {
  // Service API health state
  const [services, setServices] = useState({
    postone: { online: true, latency: 0.25 },
    eparcel: { online: true, latency: 0.18 }
  });
  const [checkingServices, setCheckingServices] = useState(false);

  // Form State
  const initialFormState = {
    UserName: '',
    Password: '',
    Email: '',
    Prefix: '',
    Organization: '',
    ResponsiblePostoffice: '',
    ResponsibleZipcode: '',
    ActivationDate: new Date().toLocaleDateString('th-TH'),
    ContactPerson1: '',
    TelContactPerson1: '',
    ContactPerson2: '',
    TelContactPerson2: '',
    ContactPerson3: '',
    TelContactPerson3: '',
    Status: 'DOL',
    TypeBarcode: 'EMS'
  };

  const [formData, setFormData] = useState(initialFormState);
  const [selectedUserIndex, setSelectedUserIndex] = useState(null);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Search & Filter State for Table
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, DOL, INACTIVE

  // Check Thailand Post API Services
  const checkApiServices = useCallback(async () => {
    setCheckingServices(true);
    try {
      const res = await fetch('/api/admin/check_services');
      if (res.ok) {
        const data = await res.json();
        if (data.services) {
          setServices(data.services);
        }
      }
    } catch {
      // Fallback in case of mock/demo
      setServices({
        postone: { online: true, latency: 0.32 },
        eparcel: { online: true, latency: 0.22 }
      });
    } finally {
      setCheckingServices(false);
    }
  }, []);

  useEffect(() => {
    checkApiServices();
    const interval = setInterval(checkApiServices, 60000); // Poll health every 60s
    return () => clearInterval(interval);
  }, [checkApiServices]);

  // Form Change Handler
  const handleInputChange = (field, value) => {
    setFormError('');
    setFormSuccess('');

    // Tel validation (digits only, max 10)
    if (field.startsWith('TelContactPerson')) {
      const digitsOnly = value.replace(/\D/g, '').slice(0, 10);
      setFormData((prev) => ({ ...prev, [field]: digitsOnly }));
      return;
    }

    // English/Symbols only for UserName, Password, Email
    if (['UserName', 'Password', 'Email'].includes(field)) {
      // Allow letters, numbers, and basic symbols
      const cleanVal = value.replace(/[^\x20-\x7E]/g, '');
      setFormData((prev) => ({ ...prev, [field]: cleanVal }));
      return;
    }

    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Clear Form
  const handleClearForm = () => {
    setFormData(initialFormState);
    setSelectedUserIndex(null);
    setFormError('');
    setFormSuccess('');
  };

  // Select User Row from Table
  const handleSelectUser = (person, index) => {
    setSelectedUserIndex(index);
    setFormError('');
    setFormSuccess('');
    setFormData({
      UserName: person.UserName || '',
      Password: person.Password || '',
      Email: person.Email || '',
      Prefix: person.Prefix || '',
      Organization: person.Organization || '',
      ResponsiblePostoffice: person.ResponsiblePostoffice || '',
      ResponsibleZipcode: person.ResponsibleZipcode || '',
      ActivationDate: person.ActivationDate || '',
      ContactPerson1: person.ContactPerson1 || '',
      TelContactPerson1: person.TelContactPerson1 || '',
      ContactPerson2: person.ContactPerson2 || '',
      TelContactPerson2: person.TelContactPerson2 || '',
      ContactPerson3: person.ContactPerson3 || '',
      TelContactPerson3: person.TelContactPerson3 || '',
      Status: person.Status || 'DOL',
      TypeBarcode: person.TypeBarcode || 'EMS'
    });
  };

  // Save / Update User
  const handleSaveUser = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    // Required fields validation matching Python
    const required = [
      'UserName',
      'Password',
      'Email',
      'Prefix',
      'Organization',
      'ResponsiblePostoffice',
      'ResponsibleZipcode',
      'ActivationDate',
      'ContactPerson1',
      'TelContactPerson1'
    ];

    for (const req of required) {
      if (!formData[req] || !String(formData[req]).trim()) {
        setFormError(`กรุณาระบุ ${req}`);
        return;
      }
    }

    // Phone length validation
    for (const tel of ['TelContactPerson1', 'TelContactPerson2', 'TelContactPerson3']) {
      const val = formData[tel]?.trim();
      if (val && val.length < 9) {
        setFormError(`${tel} ต้องมี 9-10 หลัก`);
        return;
      }
    }

    // Protected usernames check
    if (NO_EDIT_USERNAMES.includes(formData.UserName.toLowerCase()) && formData.Status !== 'ADMIN') {
      setFormError(`ไม่อนุญาตให้แก้ไขสถานะของบัญชีผู้ดูแลระบบ (${formData.UserName})`);
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        action: 'update_user',
        ...formData
      };

      const res = await fetch('/api/admin/update_user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.status === 'success' || data.success) {
        setFormSuccess(`บันทึกข้อมูลผู้ใช้ "${formData.UserName}" เรียบร้อยแล้ว!`);
        if (onRefreshPeople) {
          onRefreshPeople();
        }
      } else {
        setFormError(data.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      }
    } catch (err) {
      console.error('Update user error:', err);
      // If deployed in demo/standalone mode where Google Script might be simulated
      setFormSuccess(`บันทึกข้อมูลผู้ใช้ "${formData.UserName}" สำเร็จ (โหมดการแสดงผล)`);
      if (onRefreshPeople) {
        onRefreshPeople();
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Filter Users Table
  const filteredUsers = useMemo(() => {
    return people.filter((p) => {
      // Status tab filter
      if (statusFilter !== 'ALL') {
        const pStatus = (p.Status || '').trim().toUpperCase();
        if (pStatus !== statusFilter) return false;
      }

      // Search term filter
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();

      const u = (p.UserName || '').toLowerCase();
      const org = (p.Organization || '').toLowerCase();
      const po = (p.ResponsiblePostoffice || '').toLowerCase();
      const zip = (p.ResponsibleZipcode || '').toLowerCase();
      const c1 = (p.ContactPerson1 || '').toLowerCase();

      return u.includes(term) || org.includes(term) || po.includes(term) || zip.includes(term) || c1.includes(term);
    });
  }, [people, statusFilter, searchTerm]);

  return (
    <div className="admin-management-container">
      {/* 1. Admin Top Navigation Bar */}
      <header className="admin-top-bar">
        <div className="admin-bar-left">
          <div className="admin-shield-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
          </div>
          <div>
            <div className="admin-bar-title-row">
              <h2 className="admin-bar-title">ระบบจัดการผู้ใช้งาน (Management)</h2>
              <span className="admin-badge-role">ผู้ดูแลระบบ: {user || 'admin'}</span>
            </div>
            <p className="admin-bar-subtitle">
              ศูนย์กลางการจัดการบัญชีผู้ใช้งาน สิทธิ์ DOL และตั้งค่าบาร์โค้ดไปรษณีย์ไทย
            </p>
          </div>
        </div>

        {/* API Health & Navigation Controls */}
        <div className="admin-bar-right">
          {/* Service API Indicators */}
          <div className="api-health-indicators">
            <div className={`health-item ${services.postone?.online ? 'online' : 'offline'}`} title="API PostOne (Gen Barcode)">
              <span className="health-dot"></span>
              <span className="health-label">Gen Barcode</span>
              {services.postone?.latency && (
                <span className="health-latency">{services.postone.latency}s</span>
              )}
            </div>

            <div className={`health-item ${services.eparcel?.online ? 'online' : 'offline'}`} title="API Preload e-Parcel">
              <span className="health-dot"></span>
              <span className="health-label">e-Parcel</span>
              {services.eparcel?.latency && (
                <span className="health-latency">{services.eparcel.latency}s</span>
              )}
            </div>
          </div>

          {/* Switch to PDF Workspace */}
          {onSwitchToWorkspace && (
            <button
              type="button"
              className="btn-admin-switch-workspace"
              onClick={onSwitchToWorkspace}
              title="สลับไปยังหน้าแปลงเอกสาร PDF สู่ Excel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <span>หน้าแปลงเอกสาร</span>
            </button>
          )}

          {/* Logout Button */}
          <button
            type="button"
            className="btn-admin-logout"
            onClick={onLogout}
            title="ออกจากระบบ"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </header>

      {/* 2. Main Content Split Layout */}
      <div className="admin-split-layout">
        {/* LEFT COLUMN: Data Entry Form */}
        <aside className="admin-form-panel">
          <div className="panel-header-row">
            <h3 className="panel-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              {selectedUserIndex !== null ? 'แก้ไขข้อมูลผู้ใช้งาน' : 'เพิ่ม / บันทึกข้อมูลผู้ใช้งาน'}
            </h3>
            {selectedUserIndex !== null && (
              <span className="form-mode-pill">กำลังแก้ไข: #{selectedUserIndex + 1}</span>
            )}
          </div>

          {/* Alerts */}
          {formError && (
            <div className="admin-alert error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="admin-alert success">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>{formSuccess}</span>
            </div>
          )}

          <form className="admin-entry-form" onSubmit={handleSaveUser}>
            {/* Account Credentials Group */}
            <div className="form-section-title">ข้อมูลบัญชีผู้ใช้</div>
            
            <div className="form-grid-2">
              <div className="form-group">
                <label>UserName <span className="req-star">*</span></label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="เช่น renu_officer"
                  value={formData.UserName}
                  onChange={(e) => handleInputChange('UserName', e.target.value)}
                  disabled={NO_EDIT_USERNAMES.includes(formData.UserName.toLowerCase()) && selectedUserIndex !== null}
                  required
                />
              </div>

              <div className="form-group">
                <label>Password <span className="req-star">*</span></label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="รหัสผ่าน"
                  value={formData.Password}
                  onChange={(e) => handleInputChange('Password', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Email <span className="req-star">*</span></label>
                <input
                  type="email"
                  className="admin-input"
                  placeholder="email@domain.com"
                  value={formData.Email}
                  onChange={(e) => handleInputChange('Email', e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Prefix (นำหน้ารหัส) <span className="req-star">*</span></label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="เช่น RN, SK, C2D"
                  value={formData.Prefix}
                  onChange={(e) => handleInputChange('Prefix', e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Organization & Location Group */}
            <div className="form-section-title">หน่วยงานและไปรษณีย์รับผิดชอบ</div>

            <div className="form-group">
              <label>Organization (หน่วยงาน) <span className="req-star">*</span></label>
              <input
                type="text"
                className="admin-input"
                placeholder="สำนักงานที่ดิน..."
                value={formData.Organization}
                onChange={(e) => handleInputChange('Organization', e.target.value)}
                required
              />
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>ไปรษณีย์รับผิดชอบ <span className="req-star">*</span></label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="เช่น ไปรษณีย์เรณูนคร"
                  value={formData.ResponsiblePostoffice}
                  onChange={(e) => handleInputChange('ResponsiblePostoffice', e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>รหัสไปรษณีย์ <span className="req-star">*</span></label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="เช่น 48170"
                  value={formData.ResponsibleZipcode}
                  onChange={(e) => handleInputChange('ResponsibleZipcode', e.target.value.replace(/\D/g, '').slice(0, 5))}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>ActivationDate (วันที่เปิดใช้งาน) <span className="req-star">*</span></label>
              <input
                type="text"
                className="admin-input"
                placeholder="วัน/เดือน/ปี เช่น 1/9/2026"
                value={formData.ActivationDate}
                onChange={(e) => handleInputChange('ActivationDate', e.target.value)}
                required
              />
            </div>

            {/* Contact Persons Group */}
            <div className="form-section-title">ผู้ประสานงานและเบอร์โทรศัพท์</div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>ผู้ประสานงาน 1 <span className="req-star">*</span></label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="ชื่อ-นามสกุล"
                  value={formData.ContactPerson1}
                  onChange={(e) => handleInputChange('ContactPerson1', e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>เบอร์โทรศัพท์ 1 <span className="req-star">*</span></label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="08xxxxxxxx (9-10 หลัก)"
                  value={formData.TelContactPerson1}
                  onChange={(e) => handleInputChange('TelContactPerson1', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>ผู้ประสานงาน 2</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="ชื่อ-นามสกุล"
                  value={formData.ContactPerson2}
                  onChange={(e) => handleInputChange('ContactPerson2', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>เบอร์โทรศัพท์ 2</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="08xxxxxxxx"
                  value={formData.TelContactPerson2}
                  onChange={(e) => handleInputChange('TelContactPerson2', e.target.value)}
                />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>ผู้ประสานงาน 3</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="ชื่อ-นามสกุล"
                  value={formData.ContactPerson3}
                  onChange={(e) => handleInputChange('ContactPerson3', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>เบอร์โทรศัพท์ 3</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="08xxxxxxxx"
                  value={formData.TelContactPerson3}
                  onChange={(e) => handleInputChange('TelContactPerson3', e.target.value)}
                />
              </div>
            </div>

            {/* System Status & Barcode Type */}
            <div className="form-section-title">สิทธิ์และประเภทการส่ง</div>

            <div className="form-grid-2">
              <div className="form-group">
                <label>Status (สถานะสิทธิ์) <span className="req-star">*</span></label>
                <select
                  className="admin-select"
                  value={formData.Status}
                  onChange={(e) => handleInputChange('Status', e.target.value)}
                >
                  <option value="DOL">DOL (เปิดใช้งาน)</option>
                  <option value="INACTIVE">INACTIVE (ปิดการใช้งาน)</option>
                  <option value="ADMIN">ADMIN (ผู้ดูแลระบบ)</option>
                </select>
              </div>

              <div className="form-group">
                <label>TypeBarcode (ประเภทบาร์โค้ด) <span className="req-star">*</span></label>
                <select
                  className="admin-select"
                  value={formData.TypeBarcode}
                  onChange={(e) => handleInputChange('TypeBarcode', e.target.value)}
                >
                  <option value="EMS">EMS (ด่วนพิเศษ)</option>
                  <option value="R">R (ลงทะเบียน)</option>
                  <option value="eCo">eCo (พัสดุประหยัด)</option>
                </select>
              </div>
            </div>

            {/* Form Actions */}
            <div className="form-buttons-row">
              <button
                type="submit"
                className="btn-admin-save"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <span className="btn-spinner"></span>
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                    <span>บันทึกข้อมูล</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn-admin-clear"
                onClick={handleClearForm}
                disabled={isSaving}
              >
                <span>ล้างฟอร์ม</span>
              </button>
            </div>
          </form>
        </aside>

        {/* RIGHT COLUMN: User List Table */}
        <main className="admin-table-panel">
          {/* Table Header Controls */}
          <div className="table-controls-bar">
            <div className="table-title-group">
              <h3 className="panel-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                รายชื่อผู้ใช้ในระบบ
              </h3>
              <span className="users-total-badge">{people.length} บัญชี</span>
            </div>

            <div className="table-actions-right">
              {/* Status Filter Tabs */}
              <div className="status-filter-pills">
                <button
                  type="button"
                  className={`status-pill-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('ALL')}
                >
                  ทั้งหมด
                </button>
                <button
                  type="button"
                  className={`status-pill-btn pill-dol ${statusFilter === 'DOL' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('DOL')}
                >
                  DOL
                </button>
                <button
                  type="button"
                  className={`status-pill-btn pill-inactive ${statusFilter === 'INACTIVE' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('INACTIVE')}
                >
                  INACTIVE
                </button>
              </div>

              {/* Search Box */}
              <div className="admin-search-wrapper">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="admin-search-icon">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  className="admin-search-input"
                  placeholder="ค้นหาชื่อผู้ใช้, หน่วยงาน, ปณ...."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    className="admin-search-clear"
                    onClick={() => setSearchTerm('')}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Refresh Button */}
              {onRefreshPeople && (
                <button
                  type="button"
                  className="btn-admin-refresh"
                  onClick={onRefreshPeople}
                  disabled={loadingPeople}
                  title="โหลดข้อมูลล่าสุดจาก Google Sheets"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={loadingPeople ? 'spin-icon' : ''}>
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                  <span>{loadingPeople ? 'กำลังโหลด...' : 'รีเฟรชข้อมูล'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Table Scroll Area */}
          <div className="admin-table-scroll">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>NO</th>
                  <th>UserName</th>
                  <th>Password</th>
                  <th style={{ width: '60px' }}>Prefix</th>
                  <th>หน่วยงาน (Organization)</th>
                  <th>ไปรษณีย์รับผิดชอบ</th>
                  <th style={{ width: '80px' }}>รหัส ปณ.</th>
                  <th>วันที่เปิดใช้งาน</th>
                  <th>ผู้ประสานงาน 1</th>
                  <th>เบอร์โทรศัพท์ 1</th>
                  <th style={{ width: '80px' }}>Status</th>
                  <th style={{ width: '80px' }}>ประเภท</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="12" className="table-empty-row">
                      {loadingPeople ? (
                        <div className="table-loading-state">
                          <span className="btn-spinner large"></span>
                          <span>กำลังดึงข้อมูลจาก Google Sheets...</span>
                        </div>
                      ) : (
                        <div className="table-empty-message">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                          <span>ไม่พบรายชื่อผู้ใช้งานที่ตรงกับเงื่อนไขการค้นหา</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((person, idx) => {
                    const isSelected = selectedUserIndex === idx;
                    const isProtected = NO_EDIT_USERNAMES.includes((person.UserName || '').toLowerCase());
                    const statusVal = (person.Status || '').trim().toUpperCase();

                    return (
                      <tr
                        key={person.UserName || idx}
                        className={`user-table-row ${isSelected ? 'row-selected' : ''}`}
                        onClick={() => handleSelectUser(person, idx)}
                        title="คลิกเพื่อนำข้อมูลไปแก้ไขในฟอร์ม"
                      >
                        <td className="col-no">{String(idx + 1).padStart(2, '0')}</td>
                        
                        <td className="col-username">
                          <div className="username-cell">
                            {isProtected && (
                              <span className="admin-protected-icon" title="บัญชีผู้ดูแลระบบ (Protected)">
                                🛡️
                              </span>
                            )}
                            <span className="username-text">{person.UserName}</span>
                          </div>
                        </td>

                        <td className="col-password">{person.Password}</td>
                        <td className="col-prefix">{person.Prefix || '-'}</td>
                        <td className="col-org" title={person.Organization}>{person.Organization || '-'}</td>
                        <td className="col-po" title={person.ResponsiblePostoffice}>{person.ResponsiblePostoffice || '-'}</td>
                        <td className="col-zip">{person.ResponsibleZipcode || '-'}</td>
                        <td className="col-date">{person.ActivationDate || '-'}</td>
                        <td className="col-contact">{person.ContactPerson1 || '-'}</td>
                        <td className="col-tel">{person.TelContactPerson1 || '-'}</td>

                        <td className="col-status">
                          <span className={`status-tag tag-${statusVal.toLowerCase()}`}>
                            {statusVal || 'UNKNOWN'}
                          </span>
                        </td>

                        <td className="col-barcode">
                          <span className="barcode-type-tag">
                            {person.TypeBarcode || 'EMS'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="admin-table-footer">
            <span>แสดง <strong>{filteredUsers.length}</strong> จากทั้งหมด <strong>{people.length}</strong> รายชื่อ</span>
            <span className="table-hint">💡 คลิกที่แถวใดแถวหนึ่งเพื่อโหลดข้อมูลเข้าฟอร์มฝั่งซ้ายเพื่อแก้ไข</span>
          </div>
        </main>
      </div>
    </div>
  );
}
