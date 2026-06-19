import assert from 'node:assert';
import { pathToFileURL } from 'node:url';
import {
  classifySemanticEditScriptAdmission,
  semanticEditScriptAutoMergeOperationCoverage,
  semanticEditScriptCleanOperationCoverage,
  semanticEditScriptFromUnknown
} from '../../dist/semantic-edit-admission.js';

export async function testSemanticEditLockdown() {
  const portable = semanticEditScriptFromUnknown({
    kind: 'frontier.lang.semanticEditScript',
    summary: {
      total: 1,
      operations: 1
    },
    operations: [
      {
        kind: 'export-rename',
        status: 'portable',
        semanticKey: 'export:oldName',
        semanticIdentityHash: 'semantic:oldName',
        sourceIdentityHash: 'source:oldName',
        operationContentHash: 'op:rename'
      }
    ]
  });
  assert.strictEqual(portable.portable, 1);
  assert.deepStrictEqual(classifySemanticEditScriptAdmission(portable), {
    status: 'needs-port',
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: ['semantic edit script portable edit lacks explicit auto-merge admission after ownership, projection, and replay gates']
  });

  const booleanAdmission = semanticEditScriptFromUnknown({
    kind: 'frontier.lang.semanticEditScript',
    summary: {
      total: 1,
      operations: 1,
      byStatus: {
        portable: 1
      }
    },
    admission: {
      autoMergeCandidate: true
    }
  });
  assert.strictEqual(booleanAdmission.autoMergeCandidates, 1);
  assert.strictEqual(classifySemanticEditScriptAdmission(booleanAdmission).status, 'auto-merge-candidate');

  const camelReviewRequired = semanticEditScriptFromUnknown({
    kind: 'frontier.lang.semanticEditScript',
    summary: {
      total: 1,
      operations: 1,
      byStatus: {
        portable: 1,
        reviewRequired: 1
      }
    },
    admission: {
      status: 'auto-merge-candidate'
    }
  });
  assert.strictEqual(camelReviewRequired.reviewRequired, 1);
  assert.deepStrictEqual(classifySemanticEditScriptAdmission(camelReviewRequired), {
    status: 'review-required',
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: ['semantic edit script needs review']
  });

  const ambiguousAdmission = semanticEditScriptFromUnknown({
    kind: 'frontier.lang.semanticEditScript',
    summary: {
      total: 1,
      operations: 1,
      byStatus: {
        portable: 1,
        'auto-merge-candidate': 1
      }
    },
    admission: {
      status: 'ambiguous'
    }
  });
  assert.strictEqual(ambiguousAdmission.reviewRequired, 1);
  assert.deepStrictEqual(classifySemanticEditScriptAdmission(ambiguousAdmission), {
    status: 'review-required',
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: ['semantic edit script needs review']
  });

  const autoApplyWithoutAdmission = semanticEditScriptFromUnknown({
    kind: 'frontier.lang.semanticEditScript',
    summary: {
      total: 1,
      operations: 1,
      byStatus: {
        'auto-apply-candidate': 1
      }
    }
  });
  assert.strictEqual(autoApplyWithoutAdmission.autoApplyCandidates, 1);
  assert.deepStrictEqual(classifySemanticEditScriptAdmission(autoApplyWithoutAdmission), {
    status: 'needs-port',
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: ['semantic edit script portable edit lacks explicit auto-merge admission after ownership, projection, and replay gates']
  });

  const admissionWithoutPortableOperation = semanticEditScriptFromUnknown({
    kind: 'frontier.lang.semanticEditScript',
    summary: {
      total: 1,
      operations: 1
    },
    admission: {
      status: 'auto-merge-candidate'
    }
  });
  assert.strictEqual(admissionWithoutPortableOperation.autoMergeCandidates, 1);
  assert.deepStrictEqual(classifySemanticEditScriptAdmission(admissionWithoutPortableOperation), {
    status: 'needs-port',
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: ['semantic edit script auto-merge admission lacks portable or already-applied operation']
  });

  const conflict = semanticEditScriptFromUnknown({
    kind: 'frontier.lang.semanticEditScript',
    summary: {
      total: 1,
      operations: 1,
      byStatus: {
        portable: 1,
        conflict: 1
      }
    },
    admission: {
      status: 'auto-merge-candidate'
    }
  });
  assert.deepStrictEqual(classifySemanticEditScriptAdmission(conflict), {
    status: 'conflict',
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: ['semantic edit script conflicts: 1']
  });

  const stale = semanticEditScriptFromUnknown({
    kind: 'frontier.lang.semanticEditScript',
    summary: {
      total: 1,
      operations: 1,
      byStatus: {
        portable: 1,
        stale: 1
      }
    }
  });
  assert.deepStrictEqual(classifySemanticEditScriptAdmission(stale), {
    status: 'stale',
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: ['semantic edit script stale anchors: 1']
  });

  const needsPort = semanticEditScriptFromUnknown({
    kind: 'frontier.lang.semanticEditScript',
    summary: {
      total: 1,
      operations: 1,
      byStatus: {
        candidate: 1,
        portable: 1
      }
    }
  });
  assert.deepStrictEqual(classifySemanticEditScriptAdmission(needsPort), {
    status: 'needs-port',
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: ['semantic edit script needs port']
  });

  const mixedEvidenceOnlyReview = semanticEditScriptFromUnknown({
    kind: 'frontier.lang.semanticEditScript',
    summary: {
      total: 3,
      operations: 3,
      autoMergeCandidates: 2,
      reviewRequired: 1,
      byStatus: {
        portable: 2,
        covered: 1
      }
    },
    admission: {
      status: 'auto_merge_candidate',
      evidenceOnly: 1
    }
  });
  assert.strictEqual(mixedEvidenceOnlyReview.reviewRequired, 0);
  assert.strictEqual(semanticEditScriptCleanOperationCoverage(mixedEvidenceOnlyReview), 3);
  assert.strictEqual(semanticEditScriptAutoMergeOperationCoverage(mixedEvidenceOnlyReview), 3);
  assert.deepStrictEqual(classifySemanticEditScriptAdmission(mixedEvidenceOnlyReview), {
    status: 'auto-merge-candidate',
    autoMergeCandidate: true,
    cleanEligible: true,
    reasons: ['semantic edit script auto-merge candidate']
  });

  const reviewRequiredOperation = semanticEditScriptFromUnknown({
    kind: 'frontier.lang.semanticEditScript',
    summary: {
      total: 1,
      operations: 1,
      autoMergeCandidates: 1,
      reviewRequired: 1,
      byStatus: {
        portable: 1,
        review_required: 1
      }
    },
    admission: {
      status: 'auto-merge-candidate',
      'evidence-only': 1
    }
  });
  assert.strictEqual(reviewRequiredOperation.reviewRequired, 1);
  assert.deepStrictEqual(classifySemanticEditScriptAdmission(reviewRequiredOperation), {
    status: 'review-required',
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: ['semantic edit script needs review']
  });

  const partialPortableCoverage = semanticEditScriptFromUnknown({
    kind: 'frontier.lang.semanticEditScript',
    summary: {
      total: 2,
      operations: 2,
      autoMergeCandidates: 2,
      byStatus: {
        portable: 1
      }
    },
    admission: {
      status: 'auto-merge-candidate'
    }
  });
  assert.deepStrictEqual(classifySemanticEditScriptAdmission(partialPortableCoverage), {
    status: 'needs-port',
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: ['semantic edit script auto-merge admission lacks full clean operation coverage after ownership, projection, and replay gates']
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await testSemanticEditLockdown();
}
