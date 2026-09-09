import React, { useState, useMemo } from 'react';
import FileListModal from './FileListModal';
import './PreviewGrid.css';

export default function PreviewGrid({
  records = [],
  selectedFiles = [],
  fileStatuses = {},
  onUpdateRecord,
  onDeleteRecord,
  onClearAll,
  onViewPdf
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFileListModal, setShowFileListModal] = useState(false);

  // Count failed files if any
  const failedFileCount = useMemo(() => {
    return selectedFiles.filter(f => {
      const name = typeof f === 'string' ? f : (f.name || '');
      const explicit = fileStatuses[name];
      if (explicit) return explicit.status === 'error';
      if (records.length > 0) {
        return !records.some(r => (r.SOURCE_FILE || r.source_file || '') === name);
      }
      return false;
    }).length;
  }, [selectedFiles, fileStatuses, records]);

  // Filter records based on search query
  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return records;
    const term = searchTerm.toLowerCase().trim();
    return records.filter((r) => {
      const barcode = String(r.BARCODE_NO || '').toLowerCase();
      const refNo = String(r.INV_NO || r['REF NO'] || '').toLowerCase();
      const receiver = String(r.RECEIVER || '').toLowerCase();
      const address = String(r.RECEIVER_ADDRESS || r['RECEIVER ADDRESS'] || '').toLowerCase();
      const amphur = String(r.RECEIVER_AMPHUR || r['RECEIVER AMPHUR'] || '').toLowerCase();
      const prov = String(r.RECEIVER_PROVINCE || r['RECEIVER PROVINCE'] || '').toLowerCase();
      const zip = String(r.RECEIVER_ZIPCODE || r['RECEIVER ZIPCODE'] || '');
      const apiStat = String(r.API_STATUS || '').toLowerCase();

      return (
        barcode.includes(term) ||
        refNo.includes(term) ||
        receiver.includes(term) ||
        address.includes(term) ||
        amphur.includes(term) ||
        prov.includes(term) ||
        zip.includes(term) ||
        apiStat.includes(term)
      );
    });
  }, [records, searchTerm]);

  // Checkbox logic matching Python
  const rowsWithBarcode = records.filter(r => !!r.BARCODE_NO && String(r.BARCODE_NO).trim() !== '');
  const allValidSelected = rowsWithBarcode.length > 0 && rowsWithBarcode.every(r => r.SELECTED === true);

  const handleToggleAll = () => {
    if (records.length === 0) return;
    if (rowsWithBarcode.length === 0) {
      alert("กรุณากด 'ดึงหมายเลข' เพื่อดึงหมายเลขบาร์โค้ดก่อนครับ");
      return;
    }

    const newVal = !allValidSelected;
    records.forEach((r, idx) => {
      if (r.BARCODE_NO && String(r.BARCODE_NO).trim() !== '') {
        onUpdateRecord(idx, { SELECTED: newVal });
      }
    });
  };

  const handleToggleRow = (originalIndex) => {
    const row = records[originalIndex];
    if (!row.BARCODE_NO || String(row.BARCODE_NO).trim() === '') {
      alert("รายการนี้ยังไม่มีหมายเลขบาร์โค้ด กรุณากด 'ดึงหมายเลข' เพื่อดึงหมายเลขก่อนครับ");
      return;
    }
    onUpdateRecord(originalIndex, { SELECTED: !row.SELECTED });
  };

  const handleDeleteClick = (originalIndex) => {
    const row = records[originalIndex];
    if ((row.API_STATUS || '').trim() === '✓ สำเร็จ') {
      alert("รายการนี้ถูกส่งข้อมูลสำเร็จแล้ว ไม่สามารถลบได้ครับ");
      return;
    }

    if (confirm("คุณต้องการลบข้อมูลที่เลือกใช่หรือไม่?\n\n(ระบบจะนำไฟล์ PDF ต้นฉบับของข้อมูลเหล่านี้ออกจากรายการด้วย)")) {
      onDeleteRecord(originalIndex);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setSearchTerm('');
    }
  };

  return (
    <section className="card-preview-table">
      {/* Header Bar */}
      <div className="preview-header-bar">
        <h3 className="preview-title">ตารางแสดงข้อมูล</h3>

        <div className="preview-header-right">
          {/* File Count (Clickable popup) */}
          <div 
            className="stat-label-item clickable-files-stat"
            onClick={() => setShowFileListModal(true)}
            title="คลิกเพื่อดูไฟล์ PDF ที่เลือก และสถานะการแปลงข้อมูล"
          >
            <span>ไฟล์ PDF: {selectedFiles.length} ไฟล์</span>
            {failedFileCount > 0 && (
              <span className="file-stat-failed-pill" title={`พบไฟล์ที่ไม่สำเร็จ ${failedFileCount} ไฟล์`}>
                ✕ {failedFileCount}
              </span>
            )}
          </div>

          {/* Receiver Count */}
          <div className="stat-label-item">
            รายการผู้รับ: {records.length} รายการ
          </div>

          {/* Clear All Button */}
          <div 
            className="btn-tooltip-wrapper"
            data-tooltip="ลบข้อมูลทั้งหมด"
          >
            <button
              type="button"
              className="btn-clear-pill"
              onClick={onClearAll}
              disabled={records.length === 0}
            >
              ล้างข้อมูล
            </button>
          </div>

          {/* Search Box */}
          <div className="search-box-pill">
            <input
              type="text"
              placeholder=" ค้นหาผู้รับ / เลขอ้างอิง... "
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {searchTerm && (
              <button 
                type="button" 
                className="btn-clear-search-pill" 
                onClick={() => setSearchTerm('')}
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table Frame */}
      <div className="table-wrapper">
        {records.length === 0 ? (
          <div className="empty-table-state">
            <div className="empty-icon">📁</div>
            <h4>ยังไม่มีข้อมูลในระบบ</h4>
            <p>กรุณากดปุ่ม "เพิ่มไฟล์ PDF" หรือลากไฟล์มาวางด้านบนเพื่อเริ่มการประมวลผล</p>
          </div>
        ) : (
          <table className="python-parity-table">
            <thead>
              <tr>
                {/* 1. เครื่องมือ */}
                <th className="th-tools" style={{ width: '90px' }}>เครื่องมือ</th>

                {/* 2. [ ✓ ] */}
                <th 
                  className="th-select" 
                  style={{ width: '58px', minWidth: '58px', cursor: 'pointer' }}
                  onClick={handleToggleAll}
                  title="เลือก/ยกเลิกทั้งหมด (เฉพาะที่มีบาร์โค้ด)"
                >
                  <span className={`chk-box-badge ${allValidSelected ? 'checked' : 'unchecked'}`}>
                    <span className="chk-bracket">[</span>
                    <span className="chk-mark">{allValidSelected ? '✓' : ''}</span>
                    <span className="chk-bracket">]</span>
                  </span>
                </th>

                {/* 3. ลำดับ */}
                <th style={{ width: '55px' }}>ลำดับ</th>

                {/* 4. หมายเลข */}
                <th style={{ minWidth: '135px' }}>หมายเลข</th>

                {/* 5. เลขที่อ้างอิง */}
                <th style={{ minWidth: '120px' }}>เลขที่อ้างอิง</th>

                {/* 6. ผู้รับ */}
                <th style={{ minWidth: '160px' }}>ผู้รับ</th>

                {/* 7. ที่อยู่ผู้รับ */}
                <th style={{ minWidth: '280px' }}>ที่อยู่ผู้รับ (ที่อยู่ / อำเภอ / จังหวัด)</th>

                {/* 8. รหัสไปรษณีย์ */}
                <th style={{ width: '95px' }}>รหัสไปรษณีย์</th>

                {/* 9. การส่งข้อมูล */}
                <th style={{ minWidth: '140px' }}>การส่งข้อมูล</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((row, idx) => {
                const originalIndex = records.indexOf(row);
                const isSelected = !!row.SELECTED;
                const barcode = row.BARCODE_NO || '';
                const invNo = row.INV_NO || row['REF NO'] || '-';
                const receiver = row.RECEIVER || '-';

                // Address formatting exactly matching Python gui.py line 1852:
                // addr = f"{row.get('RECEIVER_ADDRESS', '')} {row.get('RECEIVER_DISTRICT', '')} {row.get('RECEIVER_AMPHUR', '')} {row.get('RECEIVER_PROVINCE', '')}".strip()
                // addr = ' '.join(addr.split())
                const rawAddr = String(row.RECEIVER_ADDRESS || row['RECEIVER ADDRESS'] || '').trim();
                const district = String(row.RECEIVER_DISTRICT || row['RECEIVER DISTRICT'] || '').trim();
                const amphur = String(row.RECEIVER_AMPHUR || row['RECEIVER AMPHUR'] || '').trim();
                const prov = String(row.RECEIVER_PROVINCE || row['RECEIVER PROVINCE'] || '').trim();

                const fullAddress = [rawAddr, district, amphur, prov]
                  .filter(Boolean)
                  .join(' ')
                  .replace(/\s+/g, ' ')
                  .trim() || '-';

                const zipcode = String(row.RECEIVER_ZIPCODE || row['RECEIVER ZIPCODE'] || '').trim() || '-';
                const apiStatus = row.API_STATUS || 'ยังไม่ส่งข้อมูล';

                const isApiSuccess = apiStatus.includes('✓ สำเร็จ');
                const isApiError = apiStatus.includes('✗');

                return (
                  <tr 
                    key={originalIndex} 
                    className={`${idx % 2 === 0 ? 'even-row' : 'odd-row'} ${isSelected ? 'selected-row' : ''}`}
                  >
                    {/* Tools Column: Delete & View PDF */}
                    <td className="col-tools">
                      <div className="tools-icons-wrap">
                        <button
                          type="button"
                          className="btn-tool-icon btn-tool-delete"
                          onClick={() => handleDeleteClick(originalIndex)}
                          title={isApiSuccess ? 'รายการนี้ถูกส่งข้อมูลสำเร็จแล้ว ไม่สามารถลบได้' : 'ลบรายการ'}
                          disabled={isApiSuccess}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="btn-tool-icon btn-tool-view"
                          onClick={() => onViewPdf && onViewPdf(row)}
                          title="ดูไฟล์ PDF ต้นทาง"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                          </svg>
                        </button>
                      </div>
                    </td>

                    {/* Checkbox Column */}
                    <td 
                      className="col-checkbox"
                      onClick={() => handleToggleRow(originalIndex)}
                      title={barcode ? (isSelected ? 'คลิกเพื่อยกเลิกการเลือก' : 'คลิกเพื่อเลือกรายการนี้') : 'กรุณากดดึงหมายเลขก่อน'}
                    >
                      <span className={`chk-box-badge ${isSelected ? 'checked' : 'unchecked'}`}>
                        <span className="chk-bracket">[</span>
                        <span className="chk-mark">{isSelected ? '✓' : ''}</span>
                        <span className="chk-bracket">]</span>
                      </span>
                    </td>

                    {/* ลำดับ */}
                    <td className="col-no">{originalIndex + 1}</td>

                    {/* หมายเลข (Barcode) */}
                    <td className="col-barcode">
                      <span className={`barcode-text ${barcode ? 'has-bcode' : 'no-bcode'}`}>
                        {barcode || '-'}
                      </span>
                    </td>

                    {/* เลขที่อ้างอิง */}
                    <td className="col-ref">{invNo}</td>

                    {/* ผู้รับ */}
                    <td className="col-receiver" title={receiver}>{receiver}</td>

                    {/* ที่อยู่ผู้รับ */}
                    <td className="col-address" title={fullAddress}>{fullAddress}</td>

                    {/* รหัสไปรษณีย์ */}
                    <td className="col-zip">{zipcode}</td>

                    {/* การส่งข้อมูล */}
                    <td className={`col-api-status ${isApiSuccess ? 'stat-success' : isApiError ? 'stat-error' : 'stat-pending'}`}>
                      <span className="api-badge">{apiStatus}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* File List Modal */}
      <FileListModal
        isOpen={showFileListModal}
        onClose={() => setShowFileListModal(false)}
        files={selectedFiles}
        fileStatuses={fileStatuses}
        records={records}
      />
    </section>
  );
}
