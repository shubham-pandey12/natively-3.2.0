import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { packContext, TRIMMED_EVIDENCE_MARKER } = require('../../../dist-electron/electron/context-intelligence/generation/context-packer.js');

test('oversized top evidence is trimmed to fit while preserving provenance', () => {
  const decision = { claimRequirements: [], retrievalPlan: { exhaustive: false, maximumAcceptedEvidence: 3 } };
  const evidence = [{ evidenceId: 'e1', sourceId: 's1', sourceType: 'DOCUMENT', versionId: 'v1', scopeId: 'u:1',
    authorityFor: [], isDirectFact: true, acceptedFor: [], finalScore: 1, content: 'word '.repeat(1000) }];
  const packed = packContext(decision, evidence, { evidenceTokens: 180, conversationTokens: 0, transcriptTokens: 0 });
  assert.deepEqual(packed.includedEvidenceIds, ['e1']);
  assert.ok(packed.evidenceBlock.includes(TRIMMED_EVIDENCE_MARKER));
  assert.ok(packed.estimatedTokens <= 180);
  assert.match(packed.evidenceBlock, /source_id="s1"/);
});
