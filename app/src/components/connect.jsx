// Phase 3: 「チームと繋ぐ」パネル（onboard-overlay モーダル流用）。
// このファイルは firebase も lib/fb.js も import しない — 接続処理はすべて App.jsx 側。
// 二層原則: 未接続なら firebase チャンクは一切ロードされない。
import React from 'react';

const STATUS_LABEL = {
  off: '未接続',
  connecting: '接続中…',
  on: '✓ 接続済み（記録は自動でクラウドに保存）',
  error: '⚠ 接続エラー — 記録はこの端末に安全に保存されています（オンライン復帰時に自動送信）',
};

const NOTICE_TEXT = {
  none: 'ℹ️ メンタルアプリで先に自分の名前を登録すると全部つながります（このアプリからは登録しません）',
  mismatch: 'ℹ️ 別の端末がすでにメンタルアプリと繋がっています。この端末の記録もここに安全に保存されます',
  mine: '✓ メンタルアプリと連携済み',
  bridged: '✓ 繋がりました — メンタルアプリの「マイ統計」にこの端末のLAB記録（読み・GK予測・PV認知）が表示されます',
  checkfail: 'ℹ️ 連携状態を確認できませんでした（記録はこのまま安全に保存されます）',
};

function ConnectPanel({ fbLink, fbStatus, fbRoster, fbQueue, notice, manualNames, nameMap,
                        onConnect, onDisconnect, onPickRoster, onMapName, onClose }) {
  const connected = !!fbLink.enabled;
  // 名寄せ対象: 手入力名のうち roster に完全一致せず・fb-name-map 未登録のもの
  const unmapped = (connected && fbRoster.length > 0)
    ? (manualNames || []).filter(n => !fbRoster.some(r => r.name === n) && !(nameMap && nameMap[n]))
    : [];
  return (
    <div className="onboard-overlay">
      <div className="onboard-card">
        <div className="onboard-title">🔗 チームと繋ぐ</div>

        {!connected ? (
          <React.Fragment>
            <div className="onboard-desc" style={{ textAlign: 'left', whiteSpace: 'pre-line' }}>
              繋がなくても全機能そのまま使えます。繋ぐと：{'\n'}
              ・記録が端末故障で消えない{'\n'}
              ・複数端末で合流{'\n'}
              ・メンタルアプリのマイ統計にLABの記録（読み・GK予測・PV認知）が出る
            </div>
            <button className="tb-next-btn" onClick={onConnect}>🔗 チームと繋ぐ</button>
          </React.Fragment>
        ) : (
          <React.Fragment>
            {/* 状態表示 */}
            <div className="tb-card" style={{ textAlign: 'left' }}>
              <div className="tb-card-k">接続状態</div>
              <div className="tb-card-v">{STATUS_LABEL[fbStatus] || fbStatus}</div>
              {fbLink.rosterName && <div className="tb-card-v">選択中：{fbLink.rosterName}</div>}
              {(fbQueue || []).length > 0 && (
                <div className="tb-card-v">未送信 {fbQueue.length} 件 — オンラインになると自動送信</div>
              )}
            </div>

            {/* 名簿から自分を選ぶ（rosterId を保存するだけ。/rosterToUid には書き込まない） */}
            <div className="tb-field-label" style={{ marginTop: 12, textAlign: 'left' }}>名簿から自分の名前をタップ</div>
            {fbRoster.length > 0 ? (
              <div className="plan-themes" style={{ marginTop: 6 }}>
                {fbRoster.map((r, i) => (
                  <button key={r.rosterId || r.name || i} type="button"
                    className={`plan-theme-chip ${fbLink.rosterId === r.rosterId ? 'active' : ''}`}
                    onClick={() => onPickRoster(r)}>
                    {r.isGK ? '🧤 ' : ''}{r.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="tb-q-hint" style={{ marginTop: 6 }}>
                {typeof navigator !== 'undefined' && navigator.onLine === false
                  ? 'オフラインのため名簿を取得できません'
                  : '名簿を読み込み中…'}
              </div>
            )}
            {notice && NOTICE_TEXT[notice] && (
              <div className="tb-q-hint" style={{ marginTop: 8, textAlign: 'left' }}>{NOTICE_TEXT[notice]}</div>
            )}

            {/* 名寄せ（最小）: 手入力名 → rosterId or 'legacy:名前'。既存キーの名前は書き換えない */}
            {unmapped.length > 0 && (
              <div className="tb-card" style={{ marginTop: 12, textAlign: 'left' }}>
                <div className="tb-card-k">📇 手入力の選手名を名簿と対応づけ（名前は書き換えません）</div>
                {unmapped.map(n => (
                  <div key={n} style={{ marginTop: 8 }}>
                    <div className="tb-field-label">「{n}」は名簿の誰？</div>
                    <div className="plan-themes" style={{ marginTop: 4 }}>
                      {fbRoster.map((r, i) => (
                        <button key={r.rosterId || r.name || i} type="button" className="plan-theme-chip"
                          onClick={() => onMapName(n, r.rosterId)}>{r.name}</button>
                      ))}
                      <button type="button" className="plan-theme-chip"
                        onClick={() => onMapName(n, 'legacy:' + n)}>そのまま残す</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* LINE廃止アナウンス */}
            <div className="tb-q-hint" style={{ marginTop: 12, textAlign: 'left' }}>
              📢 接続中は、週次テキストのコピーはバックアップ用途では不要になりました（LINE共有用には引き続き使えます）
            </div>

            <button className="tb-ghost-btn" style={{ marginTop: 12 }} onClick={onDisconnect}>
              同期を解除（記録はこの端末に残ります）
            </button>
          </React.Fragment>
        )}

        <div className="onboard-actions">
          <button className="onboard-btn" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

export { ConnectPanel };
