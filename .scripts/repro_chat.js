// 実機 index.html のチャット検索ロジックを忠実に再現して、特定質問の挙動を診断する。
// （GLOSSARYのみ未取り込み＝語彙が増える方向なので、ヒット有無/ルーティングの結論は不変）
const fs = require('fs');
const path = require('path');
const DICT_DIR = path.join(__dirname, '..', 'dictionary');

// ---- DICT_FILES（index.html 1346-1380 と同一）----
const DICT_FILES = [
  { id:'00', name:'00_janken_map.md', title:'じゃんけんマップ（全カテゴリ横断統合）', icon:'🗺️', tags:['横断','索引','じゃんけん','原則'] },
  { id:'01', name:'01_basics.md', title:'基礎技術：パス・シュート・コンタクト', icon:'🧱', tags:['基礎','OF','シュート','ドリブル','パス','山側谷側'] },
  { id:'02', name:'02_individual.md', title:'個人対決：1on1・フェイント・突破', icon:'⚡', tags:['OF','1on1','フェイント','突破','勝ち位置'] },
  { id:'03', name:'03_numerical.md', title:'数的状況・速攻・バックチェック', icon:'🏃', tags:['数的','速攻','バックチェック','5on6','7on6'] },
  { id:'04', name:'04_cognition.md', title:'認知・判断・行動・声掛け', icon:'👁️', tags:['認知','判断','行動','声掛け','2秒の壁'] },
  { id:'05', name:'05_gk_df.md', title:'GK（ゴールキーパー）辞書', icon:'🧤', tags:['GK','GK選手','GKコーチ','先読み型','コース絞り型','ポジショニング','スタンス','フットワーク','3方向の法則'] },
  { id:'06', name:'06_post.md', title:'ポストプレー（OF・DF）', icon:'🎯', tags:['ポスト','V字位置','OF','DF'] },
  { id:'07', name:'07_formations.md', title:'クローズ/ワイド・セットOF・ウィングプレー', icon:'📐', tags:['陣形','クローズ','ワイド','セットOF','ウィング'] },
  { id:'08', name:'08_game_management.md', title:'ゲームマネジメント・ファウル戦略', icon:'⏱️', tags:['ファウル','パッシブ','7on6','タイムアウト','クローズ'] },
  { id:'09', name:'09_individual_differences.md', title:'個人差・身体特性が戦術選択に与える影響', icon:'👥', tags:['個人差','身長','スピード','利き手','左利き右バック'] },
  { id:'10', name:'10_opponent_scouting.md', title:'相手チームの視点・スカウティング', icon:'🔍', tags:['スカウト','ハーフタイム','アジャスト'] },
  { id:'11', name:'11_game_context.md', title:'試合文脈による戦術変化', icon:'🧭', tags:['試合文脈','スコア差','時間帯','退場'] },
  { id:'12', name:'12_set_plays.md', title:'セットプレー・サインプレー・スクリーン技術', icon:'📋', tags:['セットプレー','サイン','スクリーン','フリースロー'] },
  { id:'13', name:'13_global_tactics.md', title:'グローバル戦術辞書（国別・クラブ別）', icon:'🌍', tags:['国別','グローバル','クラブ','監督','普遍原則'] },
  { id:'14', name:'14_position_roles_international.md', title:'ポジション役割（多言語）', icon:'🌐', tags:['ポジション','多言語','ピボット','バック','ウィング','センター'] },
  { id:'15', name:'15_norway_gk_df_school.md', title:'ノルウェー式GK・DF育成メソッド', icon:'🇳🇴', tags:['ノルウェー','GK育成','DF育成','メンタル','ジュニア'] },
  { id:'16', name:'16_of_combinations.md', title:'コンビネーション・OFタイプ・攻撃トリガー', icon:'🔗', tags:['コンビネーション','OFタイプ','攻撃トリガー','クロス','ピック&ロール'] },
  { id:'17', name:'17_scene_index.md', title:'場面→技術 逆引きインデックス + 振り返り', icon:'🔁', tags:['逆引き','振り返り','チェックリスト','即時参考'] },
  { id:'18', name:'18_mental.md', title:'メンタルマネジメント・自己診断', icon:'🧠', tags:['メンタル','セルフトーク','プレッシャー','レベル診断'] },
  { id:'19', name:'19_drills.md', title:'練習メニュー辞書', icon:'🏋️', tags:['練習','個人練習','ペア練習','チーム練習','週間計画'] },
  { id:'20', name:'20_back_player_playbook.md', title:'バックプレーヤー判断プレイブック', icon:'⚔️', tags:['バックプレーヤー','判断ツリー','状況別','プレイブック'] },
  { id:'21', name:'21_physical_training.md', title:'フィジカルトレーニング（バックプレーヤー特化）', icon:'💪', tags:['フィジカル','トレーニング','体力','バックプレーヤー','スプリント','投擲','跳躍'] },
  { id:'22', name:'22_7m_throw.md', title:'7メートルスロー完全攻略', icon:'🎯', tags:['7m','ペナルティ','GK','シュート','メンタル','タクティカルファウル'] },
  { id:'23', name:'23_back_df_individual.md', title:'バックプレーヤーDF個人技術', icon:'🛡️', tags:['DF','バックプレーヤー','1on1','ファイトオーバー'] },
  { id:'24', name:'24_japan_asia_handball.md', title:'日本・アジアハンドボール戦術', icon:'🇯🇵', tags:['日本','アジア','韓国','カタール','彗星JAPAN','織姫JAPAN','AHF'] },
  { id:'25', name:'25_injury_prevention.md', title:'ケガ予防・ボディケア', icon:'🩹', tags:['ケガ予防','ボディケア','リカバリー','足関節','肩','膝','リハビリ'] },
  { id:'26', name:'26_tactical_formations.md', title:'戦術フォーメーション一覧', icon:'🧭', tags:['DF陣形','5-1','0-6','2-4','3-2-1','3-3','マンツーマン','7on6','フォーメーション'] },
  { id:'27', name:'27_sign_plays.md', title:'サインプレー大全集', icon:'🎬', tags:['サインプレー','セットプレー','ケンパ・トリック','クロス','スクリーン','フリースロー'] },
  { id:'28', name:'28_video_analysis.md', title:'ビデオ分析・セルフスカウティング', icon:'🎥', tags:['ビデオ分析','スカウティング','振り返り','バックプレーヤー'] },
  { id:'29', name:'29_back_player_development.md', title:'バックプレーヤー育成メソッド（各国）', icon:'🎓', tags:['育成','バックプレーヤー','ドイツ','フランス','デンマーク','アイスランド','クロアチア','スペイン'] },
  { id:'30', name:'30_rules_and_referee.md', title:'ルール・反則・審判辞典', icon:'📏', tags:['ルール','反則','審判','パッシブ','退場','カード','高校生'] },
  { id:'31', name:'31_equipment.md', title:'装備・服装規定辞典（JHA 2018準拠）', icon:'🧢', tags:['装備','服装','JHA','マウスピース','サポーター','マスク','メガネ','アクセサリー','高校生'] },
  { id:'32', name:'32_match_day.md', title:'試合当日マニュアル', icon:'🏟️', tags:['試合当日','大会','ウォームアップ','ハーフタイム','前日準備','高校生'] },
];
const ALL_TAGS = Array.from(new Set(DICT_FILES.flatMap(f => f.tags))).sort();

// ---- 正規化・マッチ（index.html 5148-5181 と同一）----
function chatNormalize(s){return String(s||'').replace(/[Ａ-Ｚａ-ｚ０-９]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0xFEE0)).replace(/　/g,' ').replace(/[‐－―−–—]/g,'-').toLowerCase();}
function chatIsAsciiKey(k){return /^[a-z0-9-]+$/.test(k);}
function chatHasTerm(text,k){if(!k)return false;if(!chatIsAsciiKey(k))return text.includes(k);let idx=0;while((idx=text.indexOf(k,idx))!==-1){const b=idx>0?text[idx-1]:'';const a=idx+k.length<text.length?text[idx+k.length]:'';if(!/[a-z0-9]/.test(b)&&!/[a-z0-9]/.test(a))return true;idx+=1;}return false;}
function chatCountTerm(text,k,cap){if(!k)return 0;let cnt=0,idx=0;const ascii=chatIsAsciiKey(k);while(cnt<cap&&(idx=text.indexOf(k,idx))!==-1){const b=idx>0?text[idx-1]:'';const a=idx+k.length<text.length?text[idx+k.length]:'';if(!ascii||(!/[a-z0-9]/.test(b)&&!/[a-z0-9]/.test(a)))cnt++;idx+=k.length;}return cnt;}

// ---- CHAT_SYNONYMS（index.html 5184-5234 と同一）----
const CHAT_SYNONYMS=[
  {m:['キーパー','ゴーリー','gk'],kw:['GK'],file:'05'},
  {m:['ディフェンス','守備','守り方','守れない','止め方','止められない','抜かれる','抜かれた','df'],kw:['DF','守備']},
  {m:['オフェンス','攻撃','攻め方','of'],kw:['OF','攻撃']},
  {m:['ペナルティ','pk','7m','7メートル','セブンメーター'],kw:['7m'],file:'22'},
  {m:['フェイント','かわし方','抜き方','抜けない','フェイク'],kw:['フェイント'],file:'02'},
  {m:['1on1','1対1','一対一','タイマン'],kw:['1on1'],file:'02'},
  {m:['シュートが入らない','入らない','外れる','外す','決まらない','決められない'],kw:['シュート','コース']},
  {m:['速攻','カウンター','ファストブレイク','走り方'],kw:['速攻','ウェーブ'],file:'03'},
  {m:['キャッチ','捕れない','ボールを取れない','ファンブル'],kw:['キャッチ','顔横']},
  {m:['ポスト','ピボット','ピボ'],kw:['ピボット','ポスト'],file:'06'},
  {m:['スクリーン','ピック'],kw:['スクリーン'],file:'12'},
  {m:['サインプレー','サイン','セットプレー','約束事'],kw:['サインプレー','セットプレー'],file:'27'},
  {m:['フォーメーション','陣形','システム','dfシステム'],kw:['陣形','フォーメーション'],file:'26'},
  {m:['マンツーマン','マンツー','マンマーク'],kw:['マンツーマン'],file:'26'},
  {m:['ルール','反則','ファウル','退場','カード','審判','レフェリー'],kw:['反則','ルール'],file:'30'},
  {m:['パッシブ','消極的'],kw:['パッシブ'],file:'08'},
  {m:['練習','メニュー','ドリル','トレーニング方法'],kw:['練習'],file:'19'},
  {m:['筋トレ','フィジカル','体力','スタミナ','持久力','筋力'],kw:['フィジカル','体力'],file:'21'},
  {m:['けが','ケガ','怪我','痛い','痛み','捻挫','リハビリ','違和感'],kw:['ケガ予防'],file:'25'},
  {m:['メンタル','緊張','プレッシャー','あがり','不安','ビビ','自信がない','弱気'],kw:['メンタル','プレッシャー'],file:'18'},
  {m:['ウィング','サイドプレーヤー'],kw:['ウィング']},
  {m:['バックプレーヤー','バックの'],kw:['バックプレーヤー'],file:'20'},
  {m:['センター','司令塔','cb'],kw:['センター']},
  {m:['ジャンプ','跳躍','高く飛ぶ'],kw:['ジャンプ','跳躍']},
  {m:['スカウティング','スカウト','相手分析','ビデオ','映像'],kw:['スカウティング','分析'],file:'28'},
  {m:['0-6','6-0','ゼロロク','ロクゼロ','シックスゼロ'],kw:['0-6','6-0'],file:'26'},
  {m:['5-1','1-5','ファイブワン'],kw:['5-1','1-5'],file:'26'},
  {m:['3-2-1'],kw:['3-2-1'],file:'26'},{m:['3-3'],kw:['3-3'],file:'26'},
  {m:['2-4','4-2'],kw:['2-4','4-2'],file:'26'},
  {m:['7on6','7対6','7人攻撃','空ゴール','エンプティ'],kw:['7on6'],file:'08'},
  {m:['5on6','退場中','数的不利','1人少ない'],kw:['5on6','数的'],file:'03'},
  {m:['数的優位','2対1','3対2','アウトナンバー'],kw:['数的','2on1','3on2'],file:'03'},
  {m:['タイムアウト'],kw:['タイムアウト'],file:'08'},
  {m:['ハーフタイム'],kw:['ハーフタイム'],file:'10'},
  {m:['装備','シューズ','ユニフォーム','マウスピース','サポーター','メガネ','眼鏡','アクセサリー'],kw:['装備'],file:'31'},
  {m:['試合当日','大会','ウォームアップ','ウォーミングアップ','アップの'],kw:['ウォームアップ','試合当日'],file:'32'},
  {m:['食事','栄養','睡眠','ご飯'],kw:['栄養','睡眠'],file:'25'},
  {m:['コンタクト','当たり負け','接触','押し負け','体の使い方'],kw:['コンタクト','勝ち位置']},
  {m:['左利き','サウスポー','レフティ'],kw:['左利き'],file:'09'},
  {m:['身長','背が低い','背が高い','小さい選手','大きい選手'],kw:['身長','個人差'],file:'09'},
  {m:['判断が遅い','判断','迷う','考えすぎ','認知','視野'],kw:['判断','認知'],file:'04'},
  {m:['声かけ','声掛け','コミュニケーション','声が出ない'],kw:['声掛け','声']},
  {m:['点差','残り時間','終盤','逆転','リード','ビハインド'],kw:['スコア差','時間帯'],file:'11'},
  {m:['攻略','崩し方','崩す','崩せない','対策','破り方','破る','倒し方','勝ち方','弱点'],kw:['じゃんけん'],file:'00'},
  {m:['ケンパ','空中パス','スカイ'],kw:['ケンパ'],file:'27'},
  {m:['早打ち','クイック'],kw:['早打ち']},{m:['ループ','山なり'],kw:['ループ']},{m:['ドリブル'],kw:['ドリブル']},
];
const CHAT_STOPWORDS=new Set(['こと','もの','とき','ため','よう','感じ','場合','ところ','どこ','どう','なに','何','いつ','だれ','誰','自分','相手','チーム','試合','プレー','ハンドボール','選手','今日','明日','今度','する','なる','ある','いる','たい','ほしい','いい','よい','ない','もっと','すごく','とても','これ','それ','あれ']);
const CHAT_NOISE_RE=/(について|を?教えてほしい|お?しえてください|を?教えて|ください|下さい|お願いします|お願い|したいです|したいんですけど|したい|できるようになりたい|できないです|できません|できない|出来ない|わからないです|わからない|分からない|わかりません|どうすればいい|どうすれば|どうやって|どうしたら|どんな感じ|なんですか|何ですか|ですか|でしょうか|ますか|とはなに|とは何|とは|って何|ってなに|のやり方|やり方|の方法|方法|のコツ|コツ|攻略法|攻略|対策|です|ます)/g;

// ---- レキシコン（ALL_TAGS + ハードコード。GLOSSARYは省略）----
function chatLexicon(){
  const set=new Set();
  const addTerm=(raw)=>{if(!raw)return;const base=raw.split('（')[0].trim();if(base.length>=2)set.add(base);const m=raw.match(/（([^）]+)）/);if(m)m[1].split(/[／/・,、]/).forEach(x=>{x=x.trim();if(x.length>=2)set.add(x);});};
  ALL_TAGS.forEach(addTerm);
  ['ピボット','ポスト','スクリーン','カットイン','ドライブ','ステップシュート','ジャンプシュート','ループシュート','バウンドシュート','ドリブル','ロングパス','トラベリング','オーバーステップ','ダブルドリブル','キックボール','チャージング','プッシング','ホールディング','ハッキング','ケンパ','クロス','パラレル','デンマーク','フランス','ドイツ','スペイン','クロアチア','ノルウェー','アイスランド','ポルトガル','スロベニア','スウェーデン','ソビエト','ロシア','日本','韓国','カタール','エジプト','バーレーン','逆速攻','トランジション','戻り','勝ち位置','山側','谷側','早打ち','飛び出し','受け渡し','スライド','スイッチ','ブロック','リバウンド','ルーズボール','スローイン','スローオフ','ゴールスロー','フリースロー','パッシブ','退場','警告','イエローカード','レッドカード','2分','ウォームアップ','クールダウン','ストレッチ','V字','フラッシュ','回転プレー'].forEach(addTerm);
  return [...set].map(raw=>({raw,n:chatNormalize(raw)})).filter(t=>t.n.length>=2).sort((a,b)=>b.n.length-a.n.length);
}
function chatExtractKeywords(question){
  const qn=chatNormalize(question);const kws=new Map();const fileBoosts=new Set();
  const addKw=(raw,w)=>{const n=chatNormalize(raw);if(n.length<2)return;const cur=kws.get(n);if(!cur||cur.w<w)kws.set(n,{raw,w});};
  for(const syn of CHAT_SYNONYMS){if(syn.m.some(m=>chatHasTerm(qn,chatNormalize(m)))){syn.kw.forEach(k=>addKw(k,2));if(syn.file)fileBoosts.add(syn.file);}}
  for(const t of chatLexicon()){if(chatHasTerm(qn,t.n))addKw(t.raw,2);}
  qn.replace(CHAT_NOISE_RE,'|').split(/[|、。．，,.!?！？\s・:：;；()（）「」『』〜~*％%]+/).flatMap(c=>c.split(/(?:の|は|が|を|に|で|や|も|へ)/)).map(t=>t.trim()).filter(t=>t.length>=2&&!CHAT_STOPWORDS.has(t)).forEach(t=>addKw(t,1));
  const sorted=[...kws.values()].sort((a,b)=>b.w-a.w||b.raw.length-a.raw.length).slice(0,10);
  return {kws:sorted,fileBoosts};
}
function splitSections(md,fileMeta){
  md=md.replace(/\r\n?/g,'\n');const lines=md.split('\n');const sections=[];let current=null;let preamble=[];
  for(const line of lines){const m=line.match(/^(#{1,3})\s+(.*)$/);
    if(m&&m[1].length<=2){if(current)sections.push(current);else if(preamble.length){sections.push({id:fileMeta.id+'-pre',fileId:fileMeta.id,fileTitle:fileMeta.title,fileIcon:fileMeta.icon,fileTags:fileMeta.tags,title:'冒頭',body:preamble.join('\n').trim()});}
      current={id:fileMeta.id+'-'+sections.length,fileId:fileMeta.id,fileTitle:fileMeta.title,fileIcon:fileMeta.icon,fileTags:fileMeta.tags,title:m[2].replace(/【([A-Za-z0-9]{1,2})】/g,'$1. ').replace(/【([^】]+)】/g,'$1 ').replace(/「([^」]+)」/g,'$1 ').replace(/\s+/g,' ').trim(),body:line+'\n'};
    }else{if(current)current.body+=line+'\n';else preamble.push(line);}}
  if(current)sections.push(current);return sections;
}
function chatIsStub(s){const txt=s.body.replace(/^#.*$/gm,'').replace(/^[-=*]+$/gm,'').replace(/\s+/g,'');return txt.length<30;}
function chatSearch(question,sections){
  const {kws,fileBoosts}=chatExtractKeywords(question);if(!kws.length)return{kws,fileBoosts,hits:[]};
  const scored=[];
  for(const s of sections){if(s.title==='冒頭'||chatIsStub(s))continue;
    const nTitle=chatNormalize(s.title);const nMeta=chatNormalize(s.fileTitle+' '+s.fileTags.join(' '));const nBody=chatNormalize(s.body);
    let score=0,cover=0;
    for(const {raw,w} of kws){const k=chatNormalize(raw);let pts=0;if(chatHasTerm(nTitle,k))pts+=8;if(chatHasTerm(nMeta,k))pts+=2;pts+=chatCountTerm(nBody,k,5);if(pts>0){cover++;score+=pts*w;}}
    if(score<=0)continue;if(cover>1)score*=1+0.5*(cover-1);if(fileBoosts.has(s.fileId))score*=1.6;
    scored.push({s,score,cover});}
  scored.sort((a,b)=>b.score-a.score);
  return {kws,fileBoosts,hits:scored.slice(0,8)};
}

// ---- 実行 ----
const sections=[];
for(const fm of DICT_FILES){const p=path.join(DICT_DIR,fm.name);if(!fs.existsSync(p))continue;sections.push(...splitSections(fs.readFileSync(p,'utf8'),fm));}
console.log('総セクション数:',sections.length);

const Q=process.argv[2]||'DFでどこまでがフリースローでどこからが７ｍスロー？';
console.log('\n質問:',Q);
const {kws,fileBoosts,hits}=chatSearch(Q,sections);
console.log('\n抽出キーワード:',kws.map(k=>`${k.raw}(w${k.w})`).join(' , '));
console.log('ファイルブースト(×1.6):',[...fileBoosts].join(',')||'(なし)');
if(!kws.length){console.log('\n=> 結果: 「うまく読み取れませんでした」(nokw)');}
else if(!hits.length){console.log('\n=> 結果: 「見つかりませんでした」(nohit)');}
else{
  console.log('\n=> 結果: 回答あり(answer)。上位ヒット:');
  hits.forEach((h,i)=>console.log(`  ${i+1}. [file${h.s.fileId}] ${h.s.title}  (score=${h.score.toFixed(1)}, cover=${h.cover})`));
  console.log('\n★トップ回答セクション = file'+hits[0].s.fileId+' / '+hits[0].s.title);
  // 表示される抜粋（chatBestExcerpt 簡略版：最高キーワード密度ブロック）
  const top=hits[0].s;
  const blocks=top.body.replace(/\r\n?/g,'\n').split(/\n{2,}/).map(b=>b.trim()).filter(b=>b&&!/^#{1,6}\s/.test(b.split('\n')[0]&&b.split('\n').length===1?b:'zz')&&!/^[-=*]{3,}$/.test(b));
  const sc=b=>{const nb=chatNormalize(b);let s=0;for(const{raw,w}of kws)s+=chatCountTerm(nb,chatNormalize(raw),5)*w;return s;};
  const best=blocks.map(b=>({b,sc:sc(b)})).sort((x,y)=>y.sc-x.sc)[0];
  console.log('\n表示される抜粋(冒頭150字):\n  '+(best?best.b.slice(0,150).replace(/\n/g,' '):'(なし)'));
  // 「明らかな得点チャンス」を含むセクションが全体で何位か
  const ideal=sections.find(s=>s.fileId==='30'&&s.body.includes('明らかな得点チャンス」の公式定義'));
  if(ideal){const all=chatSearch(Q,sections);/*再計算済み*/
    // 全採点で順位を出す
    const fullScored=[];for(const s of sections){if(s.title==='冒頭'||chatIsStub(s))continue;const nT=chatNormalize(s.title),nM=chatNormalize(s.fileTitle+' '+s.fileTags.join(' ')),nB=chatNormalize(s.body);let sc2=0,cv=0;for(const{raw,w}of kws){const k=chatNormalize(raw);let p=0;if(chatHasTerm(nT,k))p+=8;if(chatHasTerm(nM,k))p+=2;p+=chatCountTerm(nB,k,5);if(p>0){cv++;sc2+=p*w;}}if(sc2<=0)continue;if(cv>1)sc2*=1+0.5*(cv-1);if(fileBoosts.has(s.fileId))sc2*=1.6;fullScored.push({s,score:sc2});}
    fullScored.sort((a,b)=>b.score-a.score);
    const rank=fullScored.findIndex(x=>x.s.id===ideal.id);
    console.log('\n理想セクション「明らかな得点チャンスの定義」が含まれる節 = file'+ideal.fileId+' / '+ideal.title);
    console.log('  全採点での順位 = '+(rank>=0?(rank+1)+'位 / '+fullScored.length+'件中':'圏外(score0)')+'  → トップ4に入らなければユーザーには表示されない');
  } else { console.log('\n理想セクションが見つからない（デプロイ前の旧データの可能性）'); }
}
