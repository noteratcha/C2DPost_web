import { useState, useRef } from 'react';
import './DropZone.css';

export default function DropZone({ onFilesSelected, loading, currentCount }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFiles(e.dataTransfer.files);
    }
  };

  const handleInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFiles(e.target.files);
    }
  };

  const processSelectedFiles = (files) => {
    const pdfFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      alert('กรุณาเลือกเฉพาะไฟล์นามสกุล .pdf เท่านั้น');
      return;
    }
    onFilesSelected(pdfFiles);
  };

  return (
    <div 
      className={`dropzone-container ${isDragOver ? 'drag-over' : ''} ${loading ? 'loading' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !loading && fileInputRef.current?.click()}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleInputChange} 
        multiple 
        accept=".pdf" 
        style={{ display: 'none' }} 
      />

      <div className="dropzone-content">
        {loading ? (
          <div className="dropzone-loading">
            <div className="dz-spinner"></div>
            <h3>กำลังแยกและประมวลผลข้อมูลจาก PDF...</h3>
            <p>กรุณารอสักครู่ ระบบกำลังอ่านชื่อ ที่อยู่ และรายละเอียดในเอกสาร</p>
          </div>
        ) : (
          <>
            <div className="dropzone-icon">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <path d="M12 18v-6"/>
                <path d="m9 15 3-3 3 3"/>
              </svg>
            </div>

            <div className="dropzone-text">
              <h3>ลากและวางไฟล์ PDF ที่นี่ หรือ <span>คลิกเพื่อเลือกไฟล์</span></h3>
              <p>รองรับไฟล์ PDF เอกสารคำขอจาก สนง.ที่ดิน หรือไฟล์ไปรษณีย์ (เลือกได้หลายไฟล์พร้อมกัน)</p>
            </div>

            {currentCount > 0 && (
              <div className="dropzone-stats-badge">
                <span className="dot-green"></span>
                ปัจจุบันมีข้อมูลในระบบ {currentCount} รายการ
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
