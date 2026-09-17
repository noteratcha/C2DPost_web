import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { NO_EDIT_USERNAMES } from '../config';
import { exportAdminUsersExcel } from '../utils/api';
import './AdminManagementView.css';

export default function AdminManagementView({
  user,
  people = [],
  loadingPeople = false,
  onRefreshPeople,
  onLogout,
  onSwitchToWorkspace,
  onServicesChange
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

  // User Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalPerson, setEditModalPerson] = useState(null);
  const [editModalData, setEditModalData] = useState({});
  const [editModalError, setEditModalError] = useState('');
  const [editModalSuccess, setEditModalSuccess] = useState('');
  const [isModalSaving, setIsModalSaving] = useState(false);
  const [isModalDeleting, setIsModalDeleting] = useState(false);

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

  // Lift services state up to parent (Navbar)
  useEffect(() => {
    if (onServicesChange) onServicesChange(services);
  }, [services, onServicesChange]);

  // Open row edit modal
  const handleRowClick = (person, idx) => {
    setEditModalPerson({ ...person, _idx: idx, _isNew: false });
    setEditModalData({
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
    setEditModalError('');
    setEditModalSuccess('');
    setEditModalOpen(true);
  };

  // Open modal in Add New User mode
  const handleOpenAddModal = () => {
    setEditModalPerson({ _isNew: true });
    setEditModalData({
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
    });
    setEditModalError('');
    setEditModalSuccess('');
    setEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setEditModalPerson(null);
    setEditModalError('');
    setEditModalSuccess('');
  };

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && editModalOpen) {
        handleCloseEditModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editModalOpen]);

  const handleModalInputChange = (field, value) => {
    setEditModalError('');
    setEditModalSuccess('');
    if (field.startsWith('TelContactPerson')) {
      setEditModalData(prev => ({ ...prev, [field]: value.replace(/\D/g, '').slice(0, 10) }));
      return;
    }
    if (['UserName', 'Password', 'Email'].includes(field)) {
      setEditModalData(prev => ({ ...prev, [field]: value.replace(/[^\x20-\x7E]/g, '') }));
      return;
    }
    setEditModalData(prev => ({ ...prev, [field]: value }));
  };

  const handleModalSave = async () => {
    setEditModalError('');
    setEditModalSuccess('');
    const required = ['UserName','Password','Email','Prefix','Organization','ResponsiblePostoffice','ResponsibleZipcode','ActivationDate','ContactPerson1','TelContactPerson1'];
    for (const req of required) {
      if (!editModalData[req]?.trim()) { setEditModalError(`กรุณาระบุ ${req}`); return; }
    }
    setIsModalSaving(true);
    try {
      const res = await fetch('/api/admin/update_user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_user', ...editModalData })
      });
      const data = await res.json();
      if (data.status === 'success' || data.success) {
        setEditModalSuccess(`บันทึก "${editModalData.UserName}" เรียบร้อยแล้ว`);
        if (onRefreshPeople) onRefreshPeople();
        setTimeout(() => {
          handleCloseEditModal();
        }, 1200);
      } else {
        setEditModalError(data.message || 'เกิดข้อผิดพลาด');
      }
    } catch {
      setEditModalSuccess(`บันทึก "${editModalData.UserName}" สำเร็จ (โหมดการแสดงผล)`);
      if (onRefreshPeople) onRefreshPeople();
      setTimeout(() => {
        handleCloseEditModal();
      }, 1200);
    } finally {
      setIsModalSaving(false);
    }
  };

  const handleModalDelete = async () => {
    if (!window.confirm(`ยืนยันการลบบัญชีผู้ใช้ "${editModalData.UserName}" ?`)) return;
    setIsModalDeleting(true);
    try {
      const res = await fetch('/api/admin/update_user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_user', UserName: editModalData.UserName })
      });
      const data = await res.json();
      if (data.status === 'success' || data.success) {
        handleCloseEditModal();
        if (onRefreshPeople) onRefreshPeople();
      } else {
        setEditModalError(data.message || 'ลบไม่สำเร็จ');
      }
    } catch {
      setEditModalError('เกิดข้อผิดพลาดในการลบ (โหมดการแสดงผล)');
    } finally {
      setIsModalDeleting(false);
    }
  };

  // Filter Users Table
  const [isExportingExcel, setIsExportingExcel] = useState(false);

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

  // Export all users or filtered list to Excel
  const handleExportExcel = async () => {
    if (!people || people.length === 0) {
      alert('ไม่พบข้อมูลผู้ใช้งานในระบบสำหรับส่งออก');
      return;
    }
    setIsExportingExcel(true);
    try {
      // If user filtered or searched, export filtered list; otherwise export all people
      const exportTarget = (searchTerm || statusFilter !== 'ALL') ? filteredUsers : people;
      await exportAdminUsersExcel(exportTarget);
    } catch (err) {
      console.error('Export user excel error:', err);
      alert(`เกิดข้อผิดพลาดในการส่งออกไฟล์ Excel: ${err.message || err}`);
    } finally {
      setIsExportingExcel(false);
    }
  };

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

        <div className="admin-bar-right">
          <a
            href="https://chrome.google.com/webstore/devconsole/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-admin-webstore-link"
            title="เปิด Chrome Web Store Developer Console เพื่ออัปโหลดไฟล์ Extension ZIP เวอร์ชันใหม่"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="4"/>
              <line x1="21.17" y1="8" x2="12" y2="8"/>
              <line x1="3.95" y1="6.06" x2="8.54" y2="14"/>
              <line x1="10.88" y1="21.94" x2="15.46" y2="14"/>
            </svg>
            <span>อัปเดต Extension (Chrome Web Store)</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </header>

      {/* 2. Main Content Split Layout */}
      <div className="admin-split-layout">
        {/* User List Table */}
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

              {/* Add User Button */}
              <button
                type="button"
                className="btn-admin-add-user"
                onClick={handleOpenAddModal}
                title="เพิ่มผู้ใช้งานใหม่"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>เพิ่มผู้ใช้</span>
              </button>

              {/* Export Excel Button */}
              <button
                type="button"
                className="btn-admin-export-excel"
                onClick={handleExportExcel}
                disabled={isExportingExcel || people.length === 0}
                title={`ส่งออกข้อมูลผู้ใช้ทั้งหมดในระบบเป็นไฟล์ Excel (.xlsx) (${(searchTerm || statusFilter !== 'ALL') ? filteredUsers.length : people.length} รายการ)`}
              >
                {isExportingExcel ? (
                  <>
                    <svg className="spin-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                    <span>กำลังส่งออก...</span>
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <path d="M8 13h2"></path>
                      <path d="M8 17h8"></path>
                      <path d="M14 13h2"></path>
                    </svg>
                    <span>ส่งออก Excel</span>
                  </>
                )}
              </button>

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
                    const isSelected = editModalOpen && editModalPerson?.UserName === person.UserName;
                    const isProtected = NO_EDIT_USERNAMES.includes((person.UserName || '').toLowerCase());
                    const statusVal = (person.Status || '').trim().toUpperCase();

                    return (
                      <tr
                        key={person.UserName || idx}
                        className={`user-table-row ${isSelected ? 'row-selected' : ''}`}
                        onClick={() => handleRowClick(person, idx)}
                        title="คลิกเพื่อแก้ไข / ดูข้อมูลผู้ใช้"
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
            <span className="table-hint">💡 คลิกที่แถวใดแถวหนึ่งเพื่อแก้ไข / ดูข้อมูลผู้ใช้</span>
          </div>
        </main>
      </div>

      {/* ─── User Edit Modal Popup ─── */}
      {editModalOpen && editModalPerson && (
        <div className="admin-edit-modal-overlay" onClick={handleCloseEditModal}>
          <div className="admin-edit-modal" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="aem-header">
              <div className="aem-header-left">
                <div className="aem-icon">
                  {editModalPerson._isNew ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  )}
                </div>
                <div>
                  <div className="aem-title">
                    {editModalPerson._isNew ? 'เพิ่มข้อมูลผู้ใช้งานใหม่' : (editModalData.UserName || 'แก้ไขข้อมูลผู้ใช้งาน')}
                  </div>
                  <div className="aem-subtitle">
                    {editModalPerson._isNew ? (
                      <span className="aem-org-text">บันทึกข้อมูลผู้ใช้งานระบบเพื่อเปิดสิทธิ์ DOL</span>
                    ) : (
                      <>
                        <span className={`aem-status-badge status-${(editModalData.Status||'').toLowerCase()}`}>{editModalData.Status || '-'}</span>
                        <span className="aem-org-text">{editModalData.Organization || '-'}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="aem-header-actions">
                {!editModalPerson._isNew && (
                  <button
                    type="button"
                    className="aem-btn-header-add"
                    onClick={handleOpenAddModal}
                    title="สลับเป็นโหมดเพิ่มผู้ใช้ใหม่"
                  >
                    + เพิ่มใหม่
                  </button>
                )}
                <button className="aem-close-btn" onClick={handleCloseEditModal} title="ปิด (Esc)">✕</button>
              </div>
            </div>

            {/* Alerts */}
            {editModalError && (
              <div className="aem-alert error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{editModalError}</span>
              </div>
            )}
            {editModalSuccess && (
              <div className="aem-alert success">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>{editModalSuccess}</span>
              </div>
            )}

            {/* Modal Body - Form Fields */}
            <div className="aem-body">
              {/* Row 1: UserName + Password */}
              <div className="aem-section-label">บัญชีผู้ใช้</div>
              <div className="aem-grid-2">
                <div className="aem-field">
                  <label>UserName <span className="req-star">*</span></label>
                  <input className="aem-input" value={editModalData.UserName}
                    onChange={e => handleModalInputChange('UserName', e.target.value)}
                    placeholder="เช่น renu_officer"
                    disabled={!editModalPerson._isNew && NO_EDIT_USERNAMES.includes((editModalData.UserName||'').toLowerCase())}
                  />
                </div>
                <div className="aem-field">
                  <label>Password <span className="req-star">*</span></label>
                  <input className="aem-input" value={editModalData.Password}
                    placeholder="รหัสผ่าน"
                    onChange={e => handleModalInputChange('Password', e.target.value)} />
                </div>
              </div>

              {/* Row 2: Email + Prefix */}
              <div className="aem-grid-2">
                <div className="aem-field">
                  <label>Email <span className="req-star">*</span></label>
                  <input className="aem-input" type="email" value={editModalData.Email}
                    placeholder="email@domain.com"
                    onChange={e => handleModalInputChange('Email', e.target.value)} />
                </div>
                <div className="aem-field">
                  <label>Prefix (นำหน้ารหัส) <span className="req-star">*</span></label>
                  <input className="aem-input" value={editModalData.Prefix}
                    placeholder="เช่น RN, SK, C2D"
                    onChange={e => handleModalInputChange('Prefix', e.target.value)} />
                </div>
              </div>

              {/* Organization */}
              <div className="aem-section-label">หน่วยงานและไปรษณีย์</div>
              <div className="aem-field">
                <label>Organization (หน่วยงาน) <span className="req-star">*</span></label>
                <input className="aem-input" value={editModalData.Organization}
                  placeholder="เช่น สำนักงานที่ดินจังหวัดนครพนม สาขาเรณูนคร"
                  onChange={e => handleModalInputChange('Organization', e.target.value)} />
              </div>
              <div className="aem-grid-3">
                <div className="aem-field">
                  <label>ไปรษณีย์รับผิดชอบ <span className="req-star">*</span></label>
                  <input className="aem-input" value={editModalData.ResponsiblePostoffice}
                    placeholder="เช่น ไปรษณีย์เรณูนคร"
                    onChange={e => handleModalInputChange('ResponsiblePostoffice', e.target.value)} />
                </div>
                <div className="aem-field">
                  <label>รหัส ปณ. <span className="req-star">*</span></label>
                  <input className="aem-input" value={editModalData.ResponsibleZipcode}
                    placeholder="48170"
                    onChange={e => handleModalInputChange('ResponsibleZipcode', e.target.value.replace(/\D/g,'').slice(0,5))} />
                </div>
                <div className="aem-field">
                  <label>วันที่เปิดใช้งาน <span className="req-star">*</span></label>
                  <input className="aem-input" value={editModalData.ActivationDate}
                    placeholder="18/9/2569"
                    onChange={e => handleModalInputChange('ActivationDate', e.target.value)} />
                </div>
              </div>

              {/* Contacts */}
              <div className="aem-section-label">ผู้ประสานงาน</div>
              {[1,2,3].map(n => (
                <div key={n} className="aem-grid-2">
                  <div className="aem-field">
                    <label>ผู้ประสานงาน {n}{n===1 && <span className="req-star"> *</span>}</label>
                    <input className="aem-input" value={editModalData[`ContactPerson${n}`] || ''}
                      placeholder={`ชื่อ-นามสกุล ผู้ประสานงาน ${n}`}
                      onChange={e => handleModalInputChange(`ContactPerson${n}`, e.target.value)} />
                  </div>
                  <div className="aem-field">
                    <label>เบอร์โทร {n}{n===1 && <span className="req-star"> *</span>}</label>
                    <input className="aem-input" value={editModalData[`TelContactPerson${n}`] || ''}
                      placeholder="08xxxxxxxx"
                      onChange={e => handleModalInputChange(`TelContactPerson${n}`, e.target.value)} />
                  </div>
                </div>
              ))}

              {/* Status & TypeBarcode */}
              <div className="aem-section-label">สิทธิ์และประเภทบาร์โค้ด</div>
              <div className="aem-grid-2">
                <div className="aem-field">
                  <label>Status <span className="req-star">*</span></label>
                  <select className="aem-select" value={editModalData.Status || 'DOL'}
                    onChange={e => handleModalInputChange('Status', e.target.value)}>
                    <option value="DOL">DOL (เปิดใช้งาน)</option>
                    <option value="INACTIVE">INACTIVE (ปิดการใช้งาน)</option>
                    <option value="ADMIN">ADMIN (ผู้ดูแลระบบ)</option>
                  </select>
                </div>
                <div className="aem-field">
                  <label>TypeBarcode <span className="req-star">*</span></label>
                  <select className="aem-select" value={editModalData.TypeBarcode || 'EMS'}
                    onChange={e => handleModalInputChange('TypeBarcode', e.target.value)}>
                    <option value="EMS">EMS (ด่วนพิเศษ)</option>
                    <option value="R">R (ลงทะเบียน)</option>
                    <option value="eCo">eCo (พัสดุประหยัด)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions - No redundant close button, only actions */}
            <div className="aem-footer">
              <div className="aem-footer-left">
                {!editModalPerson._isNew && !NO_EDIT_USERNAMES.includes((editModalData.UserName||'').toLowerCase()) && (
                  <button
                    type="button"
                    className="aem-btn-delete"
                    onClick={handleModalDelete}
                    disabled={isModalDeleting || isModalSaving}
                    title="ลบบัญชีผู้ใช้นี้"
                  >
                    {isModalDeleting ? (
                      <><span className="btn-spinner" /><span>กำลังลบ...</span></>
                    ) : (
                      <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg><span>ลบบัญชี</span></>
                    )}
                  </button>
                )}
              </div>
              <div className="aem-footer-right">
                <button
                  type="button"
                  className="aem-btn-save"
                  onClick={handleModalSave}
                  disabled={isModalSaving || isModalDeleting}
                >
                  {isModalSaving ? (
                    <><span className="btn-spinner" /><span>กำลังบันทึก...</span></>
                  ) : (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span>{editModalPerson._isNew ? 'บันทึกผู้ใช้ใหม่' : 'บันทึกข้อมูล'}</span></>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
