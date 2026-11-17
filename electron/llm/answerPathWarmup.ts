type Step = { name: string; run: () => void };
const SAMPLE_INSTRUCTIONS = 'Answer in two short paragraphs. Use Python for any code. Be concise and lead with the answer.';
const SAMPLE_RESUME = 'Jordan Lee\nExperience\nSenior Engineer, Acme 2019-2024\nEducation\nBSc Computer Science\nSkills\nGo, Python, Kubernetes';

export function defaultWarmSteps(): Step[] {
  return [
    { name: 'diagram_request', run: () => { const { resolveDiagramRequest } = require('../../src/lib/diagram/diagramRequest.mjs'); for (const question of ['Can you walk me through how the payment service handles retries?', 'Draw the architecture for a URL shortener with a cache.', 'Can you chart the revenue forecast for next year?']) resolveDiagramRequest({ question, answerType: 'general_answer', activeDesign: null, featureEnabled: true, userInstructions: SAMPLE_INSTRUCTIONS, material: '' }); } },
    { name: 'instruction_analysis', run: () => { const { classifyCustomContext } = require('./customContextClassifier'); classifyCustomContext(`${SAMPLE_INSTRUCTIONS}\n\nI work on the platform team.`); } },
    { name: 'doc_shape', run: () => { const { sourceTypeForFile } = require('../context-intelligence/retrieval/mode-retrieval-port'); sourceTypeForFile('notes.md', SAMPLE_RESUME, ['REFERENCE_FILE']); } },
    { name: 'today_notice', run: () => { const { todayNotice } = require('../context-intelligence/generation/prompt-composer'); todayNotice(new Date(), 'The price sheet is valid through December 31, 2025.'); } },
  ];
}

let warmed = false;
export function scheduleAnswerPathWarmup(opts: { steps?: Step[]; schedule?: (fn: () => void, ms: number) => unknown; gapMs?: number; delayMs?: number } = {}): boolean {
  if (warmed) return false;
  warmed = true;
  const steps = opts.steps ?? defaultWarmSteps();
  const schedule = opts.schedule ?? ((fn: () => void, ms: number) => { const timer = setTimeout(fn, ms); timer.unref?.(); return timer; });
  const runFrom = (i: number): void => { if (i >= steps.length) return; try { steps[i].run(); } catch {} schedule(() => runFrom(i + 1), opts.gapMs ?? 40); };
  schedule(() => runFrom(0), opts.delayMs ?? 1500);
  return true;
}
export function resetAnswerPathWarmupForTests(): void { warmed = false; }
