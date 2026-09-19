import React from 'react';

/**
 * Catches render/lifecycle errors so the app shows a readable error screen
 * instead of a blank white page. Wrap <App /> with this at the root.
 */
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary] Uncaught render error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoDashboard = () => {
    try {
      sessionStorage.removeItem('c2dpost_deposit_report_cache');
    } catch (e) {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const msg = this.state.error && this.state.error.message
        ? this.state.error.message
        : String(this.state.error || 'Unknown error');
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fdf2f2',
            fontFamily: 'Sarabun, Prompt, sans-serif',
            padding: '24px'
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              background: '#fff',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              padding: '28px 32px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.08)'
            }}
          >
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#b91c1c', marginBottom: '8px' }}>
              ⚠️ เกิดข้อผิดพลาดในการแสดงผล
            </div>
            <p style={{ color: '#7f1d1d', margin: '0 0 16px', fontSize: '15px', lineHeight: 1.6 }}>
              ระบบพบข้อผิดพลาดในระหว่างการแสดงผลหน้านี้ (Error Boundary ตรวจพบ)
            </p>
            <div
              style={{
                background: '#fef2f2',
                border: '1px dashed #fca5a5',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '18px',
                color: '#991b1b',
                fontFamily: 'Consolas, monospace',
                fontSize: '13px',
                wordBreak: 'break-word',
                maxHeight: '140px',
                overflow: 'auto'
              }}
            >
              {msg}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#b91c1c',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                🔄 โหลดหน้านี้ใหม่
              </button>
              <button
                type="button"
                onClick={this.handleGoDashboard}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#374151',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                🏠 กลับหน้าหลัก
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}