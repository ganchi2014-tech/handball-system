// 白画面SPOF対策（羽化設計図 Major#1）。描画中の例外を捕捉し、真っ白ではなく
// 「再読み込み＋データは無事」の案内を出す。記録データは localStorage にあるため描画エラーでは消えない。
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[HANDBALL LAB] 描画エラー:', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '14px', padding: '24px', textAlign: 'center',
        background: '#0a101e', color: '#e8edf5', fontFamily: 'sans-serif',
      }}>
        <div style={{ fontSize: '40px' }}>⚠️</div>
        <div style={{ fontSize: '18px', fontWeight: 700 }}>画面の表示中にエラーが起きました</div>
        <div style={{ fontSize: '13px', lineHeight: 1.8, opacity: 0.8, maxWidth: '340px' }}>
          記録データ（振り返り・GK予測・ピヴォット認知・自作課題）は端末に保存されているので消えていません。
          再読み込みで直ることがほとんどです。直らない場合はこの画面を顧問に見せてください。
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '6px', padding: '12px 28px', fontSize: '15px', fontWeight: 700,
            borderRadius: '10px', border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer',
          }}
        >再読み込み</button>
        <div style={{
          fontSize: '11px', opacity: 0.5, maxWidth: '340px', wordBreak: 'break-all',
          marginTop: '8px', fontFamily: 'monospace',
        }}>{String(this.state.error)}</div>
      </div>
    );
  }
}

export default ErrorBoundary;
