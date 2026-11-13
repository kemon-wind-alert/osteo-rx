// 骨粗鬆症 処方アシスト — 入力するたびにその場で主薬とビタミンD/Ca製剤の候補を出す。
// 入力内容はどこにも保存・送信しない（画面を閉じれば消える）。
// 根拠: 骨粗鬆症の予防と治療ガイドライン2025年版（GL2025）と各薬剤の電子添文。
// 添付文書に数値の無い区切り（腎機能30など）は「アプリの目安」として画面に明示する。
"use strict";

const APP_VERSION = "0.4.0";
const CA_LOW = 8.8;   // 血清Ca 共用基準範囲の下限（JCCLS、病院資料経由で確認）
const CA_HIGH = 10.1; // 同 上限
const RENAL_SEVERE = 30; // アプリの目安（Ccr/eGFR）：デノタス→活性型VitD、BP/ロモの低Ca警告（添付文書のeGFR<30記載に合わせた）

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r1 = (x) => Math.round(x * 10) / 10;

// 全角数字・全角ピリオドも受け付ける
function num(id) {
  const t = $(id).value.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^\d.]/g, "");
  if (t === "" || isNaN(Number(t))) return null;
  return Number(t);
}
const val = (id) => $(id).value;

// ---------- 出典 ----------
const SRC = {
  gl: { t: "骨粗鬆症の予防と治療ガイドライン2025年版（日本骨粗鬆症学会・日本骨代謝学会・骨粗鬆症財団、ライフサイエンス出版 2025）診断基準p49・治療開始基準p91・薬剤選択p92-93・各薬のCQ p116-150・併用療法p152・逐次療法p146-157・図5-1 p156・付表1 p245・SERM p92/p135-138・ビタミンK2 p119-121・透析p184-185", u: "http://www.josteo.com/data/publications/guideline/2025_01.pdf" },
  aln: { t: "ボナロン錠35mg 添付文書 2023年1月 第3版（点滴静注900μg・経口ゼリーも同版）", u: "https://www.kegg.jp/medicus-bin/japic_med?japic_code=00052131" },
  ris: { t: "ベネット錠17.5mg 添付文書 2026年3月 第6版（75mgも同版）", u: "https://www.kegg.jp/medicus-bin/japic_med?japic_code=00052876" },
  min: { t: "リカルボン錠50mg 添付文書 2026年1月 第5版", u: "https://www.kegg.jp/medicus-bin/japic_med?japic_code=00059758" },
  ibn: { t: "ボンビバ静注1mgシリンジ 2023年10月 第5版／ボンビバ錠100mg 第6版", u: "https://www.kegg.jp/medicus-bin/japic_med?japic_code=00061939" },
  zol: { t: "リクラスト点滴静注液5mg 添付文書 2026年4月 第7版", u: "https://www.kegg.jp/medicus-bin/japic_med?japic_code=00071673" },
  dmab: { t: "プラリア皮下注60mgシリンジ 電子添文 2023年11月 第6版", u: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/430574_3999435G1023_1_15" },
  romo: { t: "イベニティ皮下注105mgシリンジ 電子添文 2021年7月 第2版", u: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/112292_3999449G1025_2_02" },
  forteo: { t: "フォルテオ皮下注キット600μg 電子添文 2025年11月 第4版", u: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/530471_2439400G1020_1_19" },
  teribone: { t: "テリボン皮下注用56.5μg 電子添文 2026年4月 第5版", u: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/100898_2439401D1028_1_20" },
  abl: { t: "オスタバロ皮下注カートリッジ1.5mg 電子添文 2026年7月 第6版", u: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/470310_2439403A1020_1_06" },
  serm: { t: "エビスタ錠60mg 添付文書 2026年3月 第4版／ビビアント錠20mg 2019年11月 第1版", u: "https://www.kegg.jp/medicus-bin/japic_med?japic_code=00049952" },
  eld: { t: "エディロールカプセル 電子添文 2024年2月 第4版", u: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/450045_3112006M1022_1_12" },
  alf: { t: "アルファロールカプセル 電子添文 2024年2月 第2版", u: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/450045_3112001M1046_1_11" },
  denotas: { t: "デノタスチュアブル配合錠 電子添文 2023年4月", u: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/530143_3219100F1020_1_05" },
  vd: { t: "Okazaki R, et al. Assessment criteria for vitamin D deficiency/insufficiency in Japan. Endocr J 2017;64(1):1-6", u: "https://doi.org/10.1507/endocrj.EJ16-0548" },
  vdIns: { t: "厚生労働省 臨床検査の保険適用について（平成30年9月）※25(OH)Dの算定要件。2026年改定後の文言は未確認", u: "https://www.mhlw.go.jp/content/12404000/000345681.pdf" },
  onj: { t: "薬剤関連顎骨壊死の病態と管理：顎骨壊死検討委員会ポジションペーパー2023", u: "https://www.jsoms.or.jp/medical/pdf/2023/0217_1.pdf" },
  fda: { t: "FDA Drug Safety Communication（2024年1月）進行CKD患者でのデノスマブによる重篤な低Ca血症の枠囲み警告", u: "https://www.fda.gov/drugs/drug-safety-communications/fda-adds-boxed-warning-increased-risk-severe-hypocalcemia-patients-advanced-chronic-kidney-disease" },
  nass: { t: "North American Spine Society. Diagnosis and Treatment of Adults with Osteoporotic Vertebral Fractures（2024）：急性期の骨粗鬆症性椎体骨折にテリパラチドを疼痛緩和・QOL改善のため提案（Grade B）", u: "https://north-american-spine-society.foleon.com/ebooks-research/osteoporotic-vertebral-fractures-clinical-guidelines/summary-of-questions-recommendations" },
  nevitt: { t: "Nevitt MC, et al. Reduced risk of back pain following teriparatide treatment: a meta-analysis. Osteoporos Int 2006;17:273-280", u: "https://pubmed.ncbi.nlm.nih.gov/16142502/" },
  hadji: { t: "Hadji P, et al. The effect of teriparatide compared with risedronate on reduction of back pain in postmenopausal women with osteoporotic vertebral fractures. Osteoporos Int 2012", u: "https://link.springer.com/article/10.1007/s00198-011-1856-y" },
  vk: { t: "グラケーカプセル15mg 電子添文 2025年6月 第2版（効能：骨粗鬆症における骨量・疼痛の改善。禁忌：ワルファリン投与中）", u: "https://www.pmda.go.jp/PmdaSearch/iyakuDetail/170033_3160002M2028_1_15" },
  ckd: { t: "日本腎臓学会 CKD診療ガイド2012（eGFR式）", u: "https://jsn.or.jp/guideline/pdf/CKDguide2012.pdf" },
};

// ---------- 主薬 ----------
const ORAL_BP_NOTE = "経口薬は起床時に水約180mLで服用し、30分は横にならず飲食を避ける。食道通過障害・30分座位不可は禁忌（→点滴・静注製剤へ）";
const PAIN_NOTE = "椎体骨折の腰痛：北米脊椎学会GL（2024）は急性期の疼痛緩和・QOL改善にテリパラチドを提案（Grade B）、メタ解析でも新規・増悪腰痛が少ない。ただしリセドロン酸との直接比較RCTでは6か月の腰痛改善に差はなく、6〜18か月の腰痛悪化が少なかった";
const VK_NOTE = "ビタミンK2（メナテトレノン：グラケー 15mgを1日3回 食後、45mg/日）：腰椎の骨密度を上げる目的なら追加の選択肢（GL2025 CQ10 提案）。ucOCの値は使用条件ではない。骨折抑制のエビデンスは無く、骨折予防目的では投与しないことを提案（CQ11）。ワルファリン服用中は禁忌";
const SERM_AGE = 70; // 閉経後早期の目安（GL2025に数値なし。アプリの目安）
const DRUGS = {
  ROMO: { name: "ロモソズマブ（イベニティ）", dose: "210mg（105mg×2本）を月1回 皮下注、12か月まで", cls: "anabolic", src: ["romo", "gl"],
    notes: ["投与中はCa・ビタミンDの補給が必要。投与後2週〜1か月でCaが下がるので測定する", "終了後は骨吸収抑制薬（アレンドロン酸・デノスマブ）へつなぐ（GL2025）"] },
  TPTD_D: { name: "テリパラチド（フォルテオ）", dose: "20μgを1日1回 自己注射、通算24か月まで（再投与不可）", cls: "pth", src: ["forteo", "gl"],
    notes: ["禁忌：高Ca血症、骨Paget病・原因不明のALP高値、骨への放射線治療歴、悪性骨腫瘍・骨転移、副甲状腺機能亢進症など", "終了後はBP／デノスマブへつなぐ（GL2025）"] },
  TPTD_W: { name: "テリパラチド（テリボン）", dose: "56.5μgを週1回 皮下注（または28.2μgオートインジェクターを週2回）、通算24か月まで", cls: "pth", src: ["teribone", "gl"],
    notes: ["禁忌はフォルテオと同様", "活性型ビタミンDは（アルファカルシドールも含め）併用を避けることが望ましい"] },
  ABL: { name: "アバロパラチド（オスタバロ）", dose: "80μgを1日1回 自己注射、通算18か月まで（再投与不可）", cls: "pth", src: ["abl", "gl"],
    notes: ["禁忌はテリパラチドと同様", "テリパラチド投与歴のある患者での安全性は未確立", "終了後はアレンドロン酸へつなぐ（GL2025）"] },
  DMAB: { name: "デノスマブ（プラリア）", dose: "60mgを6か月に1回 皮下注", cls: "resorp", src: ["dmab", "gl"],
    notes: ["中止すると多発椎体骨折が起こりうる。中止するときは必ずBPなど骨吸収抑制薬へ切り替える", "低Ca血症の約半数は初回投与から7日以内。投与開始後早期にCaを測定する"] },
  ZOL: { name: "ゾレドロン酸（リクラスト）", dose: "5mgを年1回、15分以上かけて点滴静注", cls: "bp", src: ["zol", "gl"],
    notes: ["Ccr 35未満・脱水状態は禁忌。投与前に飲水を確認", "初回は発熱などの急性期反応が出やすい"] },
  ALN: { name: "アレンドロン酸（ボナロン／フォサマック）", dose: "35mgを週1回 内服（経口ゼリー35mg週1回、点滴900μgを4週に1回も可）", cls: "bp", src: ["aln", "gl"], oral: true,
    notes: [ORAL_BP_NOTE] },
  RIS: { name: "リセドロン酸（ベネット／アクトネル）", dose: "17.5mgを週1回 または 75mgを月1回 内服", cls: "bp", src: ["ris", "gl"], oral: true,
    notes: [ORAL_BP_NOTE, "Ccr 約30未満は禁忌"] },
  MIN: { name: "ミノドロン酸（リカルボン／ボノテオ）", dose: "50mgを4週に1回 内服", cls: "bp", src: ["min", "gl"], oral: true,
    notes: [ORAL_BP_NOTE] },
  IBN: { name: "イバンドロン酸（ボンビバ）", dose: "静注1mgを月1回（または錠100mgを月1回 内服）", cls: "bp", src: ["ibn", "gl"],
    notes: ["錠剤は服用後60分、横にならず飲食を避ける"] },
  SERM: { name: "SERM（ラロキシフェン／バゼドキシフェン）", dose: "ラロキシフェン60mg または バゼドキシフェン20mg を1日1回 内服", cls: "serm", src: ["serm", "gl"],
    notes: ["閉経後女性のみ", "禁忌：静脈血栓塞栓症（既往含む）、長期不動、抗リン脂質抗体症候群"] },
};

// 選択の根拠（GL2025の各CQ。推奨＝強い、提案＝弱い）
const BASIS = {
  ALN: "骨折抑制を「推奨」・エビデンスA（CQ15 p126）。椎体RR 0.55・非椎体0.77・大腿骨近位部0.47と全部位で抑制。BPの中で先頭にした理由：リセドロン酸と同格（ともに推奨A・大腿骨まで抑制）だが、活性型ビタミンD併用で骨折抑制が示されたのはアレンドロン酸のみ（JOINT-02, p152）、剤形（週1錠・ゼリー・4週1回点滴）が多い",
  RIS: "骨折抑制を「推奨」・エビデンスA（CQ17 p128）。大腿骨近位部骨折RR 0.7（HIP試験）。アレンドロン酸と同格で、月1回製剤がある",
  ZOL: "骨折抑制を「推奨」・エビデンスA（CQ23 p134）。椎体RR 0.38・非椎体0.79・大腿骨近位部0.60。年1回点滴なので内服が難しい・飲み忘れが多い人に向く。経口BPの後ろに置いたのは点滴・急性期反応・腎機能の制約のため",
  MIN: "骨折抑制は「提案」・エビデンスA（CQ19 p130）。大腿骨近位部骨折の抑制効果の報告が無いため、アレンドロン酸・リセドロン酸・ゾレドロン酸より下位",
  IBN: "骨折抑制は「提案」・エビデンスC（CQ21 p132）。大腿骨近位部骨折の抑制効果の論文が無いため下位。月1回静注は内服が難しい人の選択肢",
  DMAB: "骨折抑制を「推奨」・エビデンスA（CQ37 p148）。図5-1ではBPと並ぶ第一選択。BPより後ろに置いたのは、中止すると多発椎体骨折が起こり得て（p148）止めるときはBPへの切替が必須のため。腎機能低下ではBPより使いやすい",
  SERM: "骨折抑制は「提案」・エビデンスA（CQ25・27）。椎体骨折は減らす（MORE試験RR 0.7）が非椎体骨折の抑制根拠は無い。閉経後早期で椎体骨折が無い人の第一選択の一つ（p92）",
  ROMO: "骨折抑制を「推奨」・エビデンスA（CQ39 p150）。大腿骨近位部骨折リスクが高い人の第一選択薬の一つ（p92）。1年以内の心筋梗塞・脳卒中は避ける",
  TPTD_D: "骨折抑制は「提案」・エビデンスA（CQ31 p141）。椎体骨折の抑制が良い適応（p92）",
  TPTD_W: "骨折抑制は「提案」・エビデンスA（CQ33 p143）。椎体骨折の抑制が良い適応（p92）",
  ABL: "骨折抑制は「提案」・エビデンスA（CQ35 p145）。椎体骨折の抑制が良い適応（p92）",
};

// ---------- 計算 ----------
function renal(age, sex, wt, ht, cr, egfrIn, dialysis) {
  const out = { ccr: null, egfr: null, egfrRaw: null, use: null, useLabel: "", text: "" };
  if (age && sex && wt && cr) out.ccr = ((140 - age) * wt) / (72 * cr) * (sex === "F" ? 0.85 : 1);
  if (egfrIn) out.egfr = egfrIn;
  else if (age && sex && cr) out.egfr = 194 * Math.pow(cr, -1.094) * Math.pow(age, -0.287) * (sex === "F" ? 0.739 : 1);
  if (out.egfr && wt && ht) {
    const bsa = 0.007184 * Math.pow(wt, 0.425) * Math.pow(ht, 0.725);
    out.egfrRaw = out.egfr * bsa / 1.73;
  }
  // 添付文書の多くはCcr基準。無ければ体表面積未補正eGFR、それも無ければeGFRで代用
  if (out.ccr != null) { out.use = out.ccr; out.useLabel = "Ccr"; }
  else if (out.egfrRaw != null) { out.use = out.egfrRaw; out.useLabel = "未補正eGFR"; }
  else if (out.egfr != null) { out.use = out.egfr; out.useLabel = "eGFR"; }
  const parts = [];
  if (out.ccr != null) parts.push(`Ccr ${r1(out.ccr)} mL/分（CG式）`);
  if (out.egfr != null) parts.push(`eGFR ${r1(out.egfr)}${egfrIn ? "" : "（Crから計算）"}`);
  if (out.egfrRaw != null) parts.push(`未補正eGFR ${r1(out.egfrRaw)}`);
  out.text = parts.join("　／　");
  if (dialysis) out.text = (out.text ? out.text + "　／　" : "") + "透析中";
  return out;
}

function collect() {
  const age = num("#age"), sex = val("#sex");
  const wt = num("#wt"), ht = num("#ht"), cr = num("#cr"), egfrIn = num("#egfr");
  const dialysis = val("#dialysis") === "yes";
  const rn = renal(age, sex, wt, ht, cr, egfrIn, dialysis);
  const yamL = num("#yamL"), yamF = num("#yamF");
  const yams = [yamL, yamF].filter((v) => v != null);
  return {
    age, sex, dialysis, rn,
    renal: dialysis ? 0 : rn.use, // 透析は最重度として扱う
    ca: num("#ca"), vd: num("#vd"),
    yamL, yamF, yamMin: yams.length ? Math.min(...yams) : null,
    vfx: Number(val("#vfx")), vpain: Number(val("#vfx")) > 0 && val("#vpain") === "yes", hipfx: val("#hipfx") === "yes",
    pelvis: val("#pelvisfx") === "yes",
    otherfx: val("#otherfx") === "yes" || val("#pelvisfx") === "yes", // 診断基準（p49）では骨盤は「その他の脆弱性骨折」
    recent: val("#fxrecent") === "recent",
    cv: val("#cv"), dental: val("#dental") === "yes", prior: val("#prior"),
  };
}

// YAM(%)→Tスコアの近似：GL2025 巻末付表1（女性・QDR）のSD/YAM比 腰椎L1-4 0.112/0.989、大腿骨頚部 0.090/0.790 ≒ 11.3〜11.4%
const SD_PCT = { L: 11.3, F: 11.4 };
const tOf = (yam, site) => (yam - 100) / SD_PCT[site];
const T_VLOW = { L: -3.0, F: -2.8 }; // 図5-1「Tスコアが非常に低い」
const YAM_VLOW = { L: Math.round(100 + T_VLOW.L * SD_PCT.L), F: Math.round(100 + T_VLOW.F * SD_PCT.F) }; // 腰椎66%・大腿骨68%

// GL2025 図5-1（ASBMR/BHOF 2024, p156）で骨形成促進薬が第一選択になる条件
function fig51(c) {
  const r = [];
  const t25 = c.yamMin != null && c.yamMin <= 70; // YAM70%以下≒T−2.5以下（p155）
  const mjr = [c.vfx > 0 && "椎体", c.pelvis && "骨盤", c.hipfx && "大腿骨近位部"].filter(Boolean).join("・");
  if (mjr && c.recent) r.push(`2年以内の${mjr}骨折（差し迫った骨折リスク）`);
  else if (mjr && t25) r.push(`${mjr}骨折＋YAM ${c.yamMin}%（70%以下≒T−2.5以下）`);
  if (c.vfx >= 2 && !c.recent && !t25) r.push("椎体骨折2個以上（多発骨折の多くは差し迫ったリスク：図5-1注#2）");
  if (c.yamL != null && c.yamL < YAM_VLOW.L) r.push(`腰椎YAM ${c.yamL}%（T−3.0未満の近似として${YAM_VLOW.L}%未満）`);
  if (c.yamF != null && c.yamF < YAM_VLOW.F) r.push(`大腿骨YAM ${c.yamF}%（T−2.8未満の近似として${YAM_VLOW.F}%未満）`);
  return r;
}

// 診断（GL2025 p49）と治療開始（p91）
function diagnose(c) {
  const majorFx = c.vfx > 0 || c.hipfx;
  if (majorFx) return { dx: "骨粗鬆症", treat: "yes", why: c.vfx > 0 ? "椎体の脆弱性骨折あり" : "大腿骨近位部の脆弱性骨折あり" };
  if (c.yamMin == null) return { dx: "判定保留", treat: "unknown", why: "YAMを入力してください" };
  if (c.otherfx && c.yamMin < 80) return { dx: "骨粗鬆症", treat: "yes", why: `その他の脆弱性骨折＋YAM ${c.yamMin}%（80%未満）` };
  if (c.yamMin <= 70) return { dx: "骨粗鬆症", treat: "yes", why: `YAM ${c.yamMin}%（70%以下）` };
  if (c.yamMin < 80) return { dx: "骨量減少", treat: "cond", why: `YAM ${c.yamMin}%（70〜80%）：大腿骨近位部骨折の家族歴、またはFRAX主要骨折10年確率15%以上なら治療開始` };
  return { dx: "正常範囲", treat: "no", why: `YAM ${c.yamMin}%（80%以上）で脆弱性骨折なし：薬物治療開始基準を満たさない` };
}

// 骨形成促進薬の適用の目安（イベニティ等の添付文書5.1の4条件。SQグレード3は入力項目なし）
function highRisk(c) {
  const reasons = [];
  const anyFx = c.vfx > 0 || c.hipfx || c.otherfx;
  if (c.vfx >= 2) reasons.push("椎体骨折2個以上");
  if (c.yamL != null && c.yamL < 60) reasons.push(`腰椎YAM ${c.yamL}%（−3.3SD未満の近似として60%未満）`);
  if (anyFx && c.yamMin != null && c.yamMin <= 70) reasons.push(`YAM ${c.yamMin}%（70%以下≒−2.5SD以下）＋脆弱性骨折`);
  return reasons;
}

// ---------- 主薬の除外・注意 ----------
function check(id, c) {
  const d = DRUGS[id];
  const ex = []; // 使えない理由
  const warn = []; // この患者での注意
  const lowCa = c.ca != null && c.ca < CA_LOW;
  const highCa = c.ca != null && c.ca > CA_HIGH;
  const sev = c.renal != null && c.renal < RENAL_SEVERE;

  if (lowCa && (d.cls === "bp" || id === "DMAB" || id === "ROMO")) ex.push(`補正Ca ${c.ca}（低Ca血症は禁忌。先に補正）`);
  if (highCa && d.cls === "pth") ex.push(`補正Ca ${c.ca}（高Ca血症は禁忌）`);
  if (id === "ROMO" && c.cv === "recent") ex.push("1年以内の心筋梗塞・脳卒中（投与を避ける）");
  if (d.cls === "pth" && c.prior === "pth") ex.push("PTH製剤は通算期間の上限まで使用済み（再投与不可）");
  if (d.cls === "pth" && c.prior === "dmab") ex.push("デノスマブ→テリパラチドは骨密度が一過性に低下するため避けたい順序（GL2025）");
  if (id === "RIS" && (c.dialysis || (c.renal != null && c.renal < 30))) ex.push(c.dialysis ? "透析（GL2025で禁忌）" : `${c.rn.useLabel} ${r1(c.renal)}（Ccr約30未満は禁忌）`);
  if (id === "ZOL" && (c.dialysis || (c.renal != null && c.renal < 35))) ex.push(c.dialysis ? "透析（GL2025で禁忌）" : `${c.rn.useLabel} ${r1(c.renal)}（Ccr 35未満は禁忌）`);
  if (id === "SERM" && c.sex === "M") ex.push("男性（閉経後骨粗鬆症のみ適応）");

  if (c.renal == null && !c.dialysis && (id === "RIS" || id === "ZOL")) warn.push("腎機能が未入力（腎機能で禁忌になる薬）");
  if (sev && (d.cls === "bp" || id === "ROMO")) warn.push(`${c.dialysis ? "透析" : c.rn.useLabel + " " + r1(c.renal)}：eGFR 30未満で低Ca血症のリスクが上がる（添付文書）。Caを頻回に測定`);
  if (sev && id === "DMAB") warn.push(`${c.dialysis ? "透析" : c.rn.useLabel + " " + r1(c.renal)}：重度腎障害では重篤な低Ca血症が起こりやすい（米FDA 2024年の枠囲み警告。注射後2〜10週は頻回にCa測定）`);
  if (c.dialysis && d.cls !== "pth" && d.cls !== "anabolic") warn.push("透析患者で骨折抑制のエビデンスがある薬は無い（GL2025）");
  if (id === "ABL" && sev) warn.push("Ccr 30未満では消失が遅れる（用量変更は不要）");
  if (id === "ROMO" && c.cv === "old") warn.push("心筋梗塞・脳卒中の既往あり（1年より前）：リスクとベネフィットを慎重に判断");
  if (c.dental && (d.cls === "bp" || id === "DMAB" || id === "ROMO"))
    warn.push("侵襲的歯科治療の予定あり：開始前に歯科受診を。抜歯などでも原則として予防的休薬はしない（顎骨壊死ポジションペーパー2023）");
  if (id === "SERM" && c.sex !== "M") warn.push("処方前に問診：静脈血栓塞栓症（深部静脈血栓症・肺塞栓症・網膜静脈血栓症）の既往、長期不動（術後・長期臥床）、抗リン脂質抗体症候群があれば禁忌");
  if (c.vpain && (id === "TPTD_D" || id === "TPTD_W")) warn.push(PAIN_NOTE);
  if ((d.cls === "pth" || id === "ROMO") && !highRisk(c).length)
    warn.push("添付文書の適用の目安（4条件）は満たさない：保険上の適応「骨折の危険性の高い骨粗鬆症」に当たるか確認（査定に注意）");
  return { ex, warn };
}

// ---------- 候補の順番 ----------
function orderMain(c, hr, dx) {
  const sev = c.dialysis || (c.renal != null && c.renal < RENAL_SEVERE);
  const mjr = c.vfx > 0 || c.hipfx || c.pelvis;
  const an = fig51(c);
  const t25 = c.yamMin != null && c.yamMin <= 70;
  const BPDM = ["ALN", "RIS", "ZOL", "DMAB"]; // 図5-1「BPまたはデノスマブ」。BP内の順はCQ15/17/23（いずれも骨折抑制を推奨A・大腿骨近位部まで抑制）
  let list, why;
  if (c.prior === "dmab") {
    list = ["DMAB", "ZOL", "ALN", an.length ? "ROMO" : null];
    why = "デノスマブ使用中：中止すると多発椎体骨折が起こりうるため継続が基本。やめる場合はBP（ゾレドロン酸・アレンドロン酸）へ切り替える（GL2025）";
  } else if (c.prior === "romo") {
    list = ["DMAB", "ALN", "ZOL"];
    why = "ロモソズマブ12か月終了後は骨吸収抑制薬（アレンドロン酸・デノスマブ）へつなぐ（GL2025）";
  } else if (c.prior === "pth") {
    list = ["DMAB", "ALN", "ZOL", "ROMO"];
    why = "PTH製剤の終了後はBP／デノスマブへつなぐ（GL2025）";
  } else if (an.length) {
    list = c.prior === "bp" ? ["ROMO", "DMAB", "TPTD_W", "TPTD_D", "ABL", "ZOL"] : ["ROMO", "TPTD_D", "TPTD_W", "ABL", "DMAB", "ZOL", "ALN"];
    why = `GL2025 図5-1（p156）で骨形成促進薬が第一選択（${an.join("、")}）。骨形成促進薬から始めて骨吸収抑制薬へつなぐ（p93）`;
    if (!hr.length) why += "。ただし添付文書の適用の目安（4条件）は満たさないので保険適応に注意";
    if (c.prior === "bp") why += "。BP長期投与後はロモソズマブで腰椎・大腿骨とも骨密度が上がるが、テリパラチドでは大腿骨の骨密度が上がらない（ただしテリパラチドの骨折抑制効果は前治療BPの影響を受けない）（p153-154）";
  } else if (sev) {
    list = ["DMAB", "ALN", "IBN", "MIN"];
    why = "重度の腎機能低下（アプリの目安：30未満）：リセドロン酸・ゾレドロン酸は禁忌（表6-7）。BPは低Caに注意しつつ慎重投与";
  } else if (c.otherfx && c.recent && t25) {
    list = ["ALN", "ROMO", "RIS", "ZOL", "DMAB"];
    why = `2年以内のその他の脆弱性骨折＋YAM ${c.yamMin}%：図5-1は「骨折部位とTスコアにより骨形成促進薬、BPまたはデノスマブ」（どの部位なら骨形成促進薬かはコンセンサス無し）。BPを第1候補、骨形成促進薬を次点に`;
  } else if (mjr) {
    list = [...BPDM, "ROMO", "TPTD_D"];
    why = "椎体・骨盤・大腿骨近位部骨折あり（2年より前、YAM 70%超）：図5-1に該当する欄は無い。p92に従い大腿骨近位部骨折の抑制根拠があるBP・デノスマブを優先";
  } else if (c.otherfx && t25) {
    list = [...BPDM, "SERM", "MIN", "IBN"];
    why = `その他の脆弱性骨折（2年より前）＋YAM ${c.yamMin}%：図5-1では「ほとんどの患者でBPまたはデノスマブを第一選択」`;
  } else {
    // GL2025 図5-1（ASBMR/BHOF 2024引用）：骨折なしで腰椎・大腿骨いずれかがT≦−2.5（YAM70%以下, p155）ならBPかデノスマブ
    const sermFirst = c.prior !== "bp" && c.sex === "F" && c.age < SERM_AGE && c.yamMin != null && c.yamMin > 70 && !(c.otherfx && c.recent);
    if (c.prior === "bp") {
      list = ["DMAB", "ALN", "ZOL", "SERM"];
      why = "BP使用中・使用歴あり：効果不十分ならBP→デノスマブが推奨される順序。経過良好ならBP継続、長期例は休薬も検討（休薬の対象はBPのみ）";
    } else if (sermFirst) {
      list = ["SERM", "ALN", "RIS", "DMAB", "ZOL", "MIN", "IBN"];
      why = `閉経後早期（アプリの目安：${SERM_AGE}歳未満）で椎体・大腿骨近位部骨折なし、YAM 70%超（骨量減少の範囲）${c.yamF == null ? "※大腿骨YAM未入力" : ""}：GL2025 p92は長期の投薬継続を考えSERMを第一選択薬の一つとする。椎体骨折は減らすが非椎体骨折の抑制根拠は無い（CQ25・27）`;
    } else {
      list = [...BPDM, "SERM", "MIN", "IBN"];
      why = "図5-1で骨形成促進薬が第一選択になる条件に当たらない：BPまたはデノスマブから開始";
      if (c.sex === "F" && c.age >= SERM_AGE) why += `（${SERM_AGE}歳以上は大腿骨近位部骨折が増えるため、その抑制根拠があるBPを優先）`;
      else if (c.yamMin != null && c.yamMin <= 70) why += `（YAM ${c.yamMin}%＝70%以下≒T−2.5以下で骨折なし：GL2025 図5-1では「ほとんどの患者にBPまたはデノスマブ」。骨密度上昇効果の高い薬を選ぶ）`;
    }
  }
  if (c.prior === "serm" && !an.length && c.sex === "F") list = ["SERM", ...list.filter((x) => x !== "SERM")];
  // 椎体骨折による腰痛：テリパラチドの疼痛軽減の報告を重視して順位を上げる
  if (c.vpain && ["none", "bp", "serm", "avd"].includes(c.prior)) {
    if (an.length) {
      const tp = c.prior === "bp" ? ["TPTD_W", "TPTD_D"] : ["TPTD_D", "TPTD_W"];
      list = [...tp, ...list.filter((x) => !tp.includes(x))];
      why += "。椎体骨折による腰痛があるため、疼痛軽減の報告があるテリパラチドを先頭にした（ロモソズマブを優先してもよい）";
    } else {
      list = list.filter((x) => x !== "TPTD_D");
      list.splice(1, 0, "TPTD_D");
      why += "。椎体骨折による腰痛があるため、疼痛軽減の報告があるテリパラチドを次点に入れた";
    }
  }
  if (dx.treat === "cond") why = "骨量減少（条件付きで治療開始）。" + why;
  const ok = [], ng = [];
  for (const id of list.filter(Boolean)) {
    const r = check(id, c);
    (r.ex.length ? ng : ok).push({ id, ...r });
  }
  return { ok, ng, why };
}

// ---------- 併用するビタミンD・Ca製剤 ----------
function companion(id, c) {
  const d = DRUGS[id];
  const highCa = c.ca != null && c.ca > CA_HIGH;
  const sev = c.dialysis || (c.renal != null && c.renal < RENAL_SEVERE);
  const vdLow = c.vd != null && c.vd < 20;
  const vdIns = c.vd != null && c.vd >= 20 && c.vd < 30;
  const out = { items: [], notes: [], src: [] };
  const ELD = { name: "エルデカルシトール（エディロール）", dose: "0.75μgを1日1回" };
  const ALF = { name: "アルファカルシドール（アルファロール／ワンアルファ）", dose: "0.5〜1.0μgを1日1回（0.5μgから開始）" };
  const DEN = { name: "デノタスチュアブル配合錠", dose: "1日1回2錠（Ca 610mg・天然型D3 400IU・Mg 30mg）" };

  if (highCa) {
    out.items.push({ name: "ビタミンD製剤・Ca製剤は使わない", dose: "" });
    out.notes.push(`補正Ca ${c.ca}（基準上限${CA_HIGH}超）：高Ca血症の原因（副甲状腺機能亢進症・悪性腫瘍など）を確認。デノタスは高Ca血症で禁忌`);
    out.src.push("eld", "denotas");
    return out;
  }
  if (id === "DMAB") {
    if (sev) {
      out.items.push(ALF);
      out.notes.push(`腎機能低下（${c.dialysis ? "透析" : c.rn.useLabel + " " + r1(c.renal)}）：デノタスの天然型D3は腎で活性化されないため、活性型ビタミンDを使いCa製剤は必要性を判断して量を調整（プラリア・デノタス添付文書。切替の数値基準は無く、30はアプリの目安）`);
      out.src.push("dmab", "denotas", "alf");
    } else if (c.prior === "avd") {
      out.items.push(ELD);
      out.notes.push("既に活性型ビタミンDを使用中：プラリア添付文書では活性型ビタミンDを適宜使い、Caは必要性を判断して調整");
      out.src.push("dmab", "eld");
    } else {
      out.items.push(DEN);
      out.notes.push("補正Caが高くない限り、毎日のCa・ビタミンD補充が前提（プラリア添付文書）。腎機能が落ちてきたら活性型ビタミンDへ切替");
      out.src.push("dmab", "denotas");
    }
    return out;
  }
  if (d.cls === "pth") {
    out.items.push({ name: "活性型ビタミンDは中止（併用しない）", dose: "" });
    out.notes.push(id === "TPTD_D"
      ? "フォルテオ：カルシトリオール・エルデカルシトールは併用を避けることが望ましい（アルファカルシドールはCa上昇に注意）"
      : "テリボン・オスタバロ：アルファカルシドールを含め活性型ビタミンDは併用を避けることが望ましい");
    if (vdLow) out.notes.push(`25(OH)D ${c.vd}（欠乏）：天然型ビタミンDの補充を検討（デノタスの適応はRANKL阻害薬併用時のみ）`);
    out.src.push(id === "TPTD_D" ? "forteo" : id === "ABL" ? "abl" : "teribone");
    return out;
  }
  // BP・ロモソズマブ・SERM：活性型ビタミンDを併用
  out.items.push(sev ? ALF : ELD);
  if (sev) out.notes.push(`腎機能低下（${c.dialysis ? "透析" : c.rn.useLabel + " " + r1(c.renal)}）：アルファカルシドールは腎での活性化が不要。エルデカルシトールでも用量規定は無いが、腎障害では投与初期にCaを頻回に測定（使い分けの区切り30はアプリの目安）`);
  if (d.cls === "bp") out.notes.push("BP＋活性型ビタミンDの併用は単剤より骨密度を上げ、骨折リスクを下げる可能性（GL2025 p152。骨折抑制が示されたのはアレンドロン酸＋アルファカルシドール：JOINT-02）");
  if (!sev) out.notes.push("エルデカルシトールは高Ca血症が出たら休薬し、正常化後0.5μgで再開（0.5μgの骨折予防効果は未確立）。Caは3〜6か月ごとに測定");
  if (id === "ROMO") out.notes.unshift("ロモソズマブ投与中はCa・ビタミンDの補給が必須（添付文書）。食事のCaが少なければCa製剤も検討（デノタスはRANKL阻害薬専用で適応外）");
  if (vdLow) out.notes.push(`25(OH)D ${c.vd}（欠乏）：天然型ビタミンDの補充も検討`);
  else if (vdIns) out.notes.push(`25(OH)D ${c.vd}（不足）`);
  out.src.push(sev ? "alf" : "eld");
  if (id === "ROMO") out.src.push("romo");
  return out;
}

// ---------- 表示 ----------
function drugCard(item, c, rank) {
  const d = DRUGS[item.id];
  const comp = companion(item.id, c);
  const notes = [...item.warn, ...d.notes];
  return `<div class="card ${rank === 0 ? "first" : ""}">
    <div class="drug">${esc(d.name)}</div>
    <div class="dose">${esc(d.dose)}</div>
    ${BASIS[item.id] ? `<div class="why">選択の根拠：${esc(BASIS[item.id])}（GL2025）</div>` : ""}
    ${notes.length ? `<ul>${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    <div class="plus">
      <div class="why">＋ 併用${item.id === "DMAB" || item.id === "ROMO" ? "（添付文書上 必要）" : d.cls === "pth" ? "" : "（検討）"}</div>
      ${comp.items.map((x) => `<div class="drug">${esc(x.name)}</div>${x.dose ? `<div class="dose">${esc(x.dose)}</div>` : ""}`).join("")}
      ${comp.notes.length ? `<ul>${comp.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    </div>
  </div>`;
}

function render() {
  const c = collect();
  $("#renalcalc").textContent = c.rn.text ? `→ ${c.rn.text}${c.rn.useLabel ? `（判定に使う値：${c.rn.useLabel}）` : ""}` : "";
  const box = $("#results");
  const anyFx = c.vfx > 0 || c.hipfx || c.otherfx;
  if (!c.age || !c.sex || (c.yamMin == null && !anyFx)) {
    box.innerHTML = `<p class="hint">年齢・性別・腎機能・骨密度（または骨折）を入れると結果が出ます。</p>`;
    return;
  }
  const dx = diagnose(c);
  const hr = highRisk(c);
  let h = "";

  // 要約
  const badges = [];
  badges.push(`<span class="badge ${dx.treat === "yes" ? "ok" : ""}">${esc(dx.dx)}</span>`);
  if (fig51(c).length) badges.push(`<span class="badge high">骨形成促進薬が第一選択（GL図5-1）</span>`);
  if (hr.length) badges.push(`<span class="badge high">添付文書の4条件を満たす</span>`);
  if (c.renal != null || c.dialysis) badges.push(`<span class="badge">${c.dialysis ? "透析" : esc(c.rn.useLabel) + " " + r1(c.renal)}</span>`);
  if (c.vd != null) badges.push(`<span class="badge">25(OH)D ${c.vd}：${c.vd < 20 ? "欠乏" : c.vd < 30 ? "不足" : "充足"}</span>`);
  if (c.ca != null) badges.push(`<span class="badge">補正Ca ${c.ca}${c.ca < CA_LOW ? "（低）" : c.ca > CA_HIGH ? "（高）" : ""}</span>`);
  h += `<div class="summary">${badges.join("")}<div class="why">${esc(dx.why)}</div></div>`;

  // 警告
  if (c.ca != null && c.ca < CA_LOW) h += `<div class="alert"><b>低Ca血症（補正Ca ${c.ca}）</b>：BP・デノスマブ・ロモソズマブは禁忌。先に原因検索と補正を。</div>`;
  if (c.ca != null && c.ca > CA_HIGH) h += `<div class="alert"><b>高Ca血症（補正Ca ${c.ca}）</b>：PTH製剤は禁忌。活性型ビタミンD・Ca製剤・デノタスは使わず、原因（副甲状腺機能亢進症・悪性腫瘍など）を確認。</div>`;
  const missing = [];
  if (c.renal == null && !c.dialysis) missing.push("腎機能（体重＋Cr、またはeGFR）");
  if (c.ca == null) missing.push("補正Ca");
  if (missing.length) h += `<div class="caution">未入力：${esc(missing.join("、"))}。禁忌の判定が不完全です。</div>`;

  if (dx.treat === "no") {
    h += `<p class="hint">薬物治療開始基準を満たしません（GL2025）。続発性骨粗鬆症の除外、食事・運動、転倒予防を。</p>`;
    h += sources(["gl"]);
    box.innerHTML = h;
    return;
  }
  if (dx.treat === "unknown") {
    h += `<p class="hint">${esc(dx.why)}</p>`;
    box.innerHTML = h;
    return;
  }

  const { ok, ng, why } = orderMain(c, hr, dx);
  h += `<div class="why" style="margin-top:8px">${esc(why)}</div>`;
  if (ok.length) {
    h += `<h3 class="rank">第1候補</h3>` + drugCard(ok[0], c, 0);
    if (ok.length > 1) h += `<h3 class="rank">次点</h3>` + ok.slice(1, 3).map((it) => drugCard(it, c, 1)).join("");
  } else {
    h += `<div class="alert"><b>この条件で使える候補がありません</b>：まず下の理由（Caの補正など）を解決してください。</div>`;
  }
  if (ng.length) {
    h += `<h3 class="rank">使えない・避ける</h3><ul class="excluded">${ng.map((it) => `<li><b>${esc(DRUGS[it.id].name)}</b>：${esc(it.ex.join("／"))}</li>`).join("")}</ul>`;
  }
  if (hr.length || c.vfx > 0) h += `<div class="caution">椎体骨折のSQ法グレード3も骨形成促進薬の適用の目安（入力項目には無いので画像で確認）。</div>`;
  h += `<div class="caution">YAMからTスコアへの換算は近似（GL2025巻末付表1 女性・QDRのSD/YAM比≒11.3〜11.4%で計算。機種・部位で数%ずれる）。腰椎${YAM_VLOW.L}%≒T−3.0、大腿骨${YAM_VLOW.F}%≒T−2.8、YAM70%≒T−2.5（p155）。境界付近はDXAのTスコアで確認。</div>`;
  h += `<div class="caution">${esc(VK_NOTE)}</div>`;

  const keys = new Set(["gl", "vd", "vdIns", "ckd", "vk"]);
  [...ok.slice(0, 3), ...ng].forEach((it) => { DRUGS[it.id].src.forEach((s) => keys.add(s)); companion(it.id, c).src.forEach((s) => keys.add(s)); });
  if (c.dental) keys.add("onj");
  if (c.vpain) ["nass", "nevitt", "hadji"].forEach((k) => keys.add(k));
  if ((c.dialysis || (c.renal != null && c.renal < RENAL_SEVERE)) && ok.some((it) => it.id === "DMAB")) keys.add("fda");
  h += sources([...keys]);
  box.innerHTML = h;
}

function sources(keys) {
  return `<details class="src"><summary>出典（${keys.length}件）</summary><ul>${keys.map((k) => `<li>${esc(SRC[k].t)}<br><a href="${esc(SRC[k].u)}" target="_blank" rel="noopener">${esc(SRC[k].u)}</a></li>`).join("")}</ul></details>`;
}

// ---------- イベント ----------
document.querySelectorAll("input, select").forEach((el) => {
  el.addEventListener("input", render);
  el.addEventListener("change", render);
  if (el.tagName === "INPUT") el.addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });
});
$("#reset").addEventListener("click", () => {
  document.querySelectorAll("input").forEach((el) => (el.value = ""));
  document.querySelectorAll("select").forEach((el) => (el.selectedIndex = 0));
  render();
  window.scrollTo(0, 0);
});
$("#ver").textContent = `v${APP_VERSION}`;
render();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
