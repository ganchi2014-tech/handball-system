// このファイルは index.html（Phase 0版）から Phase 1 S2 で機械分割された。
// 由来行: (JSON集約のみ)
import SOLVE_DATA from '../data/solve.json';
import QUESTIONS from '../data/questions.json';
import RESULTS from '../data/results.json';
import GK_SELF_RESULTS from '../data/gkSelfResults.json';
import PHYSICAL_RESULTS from '../data/physicalResults.json';
import PHYSICAL_RESULTS_EXTRA from '../data/physicalResultsExtra.json';
import OF_EXTRA_RESULTS from '../data/ofExtraResults.json';
import DF_EXTRA_RESULTS from '../data/dfExtraResults.json';

// 原本 index.html 7585/7961/8363/8507/8556 行の Object.assign を集約（順序維持＝後勝ち）
Object.assign(RESULTS, GK_SELF_RESULTS, PHYSICAL_RESULTS, PHYSICAL_RESULTS_EXTRA, OF_EXTRA_RESULTS, DF_EXTRA_RESULTS);

export { SOLVE_DATA, QUESTIONS, RESULTS, GK_SELF_RESULTS, PHYSICAL_RESULTS, PHYSICAL_RESULTS_EXTRA, OF_EXTRA_RESULTS, DF_EXTRA_RESULTS };
