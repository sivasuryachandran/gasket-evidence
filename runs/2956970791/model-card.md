# Model card: release candidate-2956970791

Written from the evidence this pipeline recorded. Each value below is copied from the manifest, the Witness decision, the signature record or the deployment receipt; "not recorded" means the record does not say.

## Purpose

A model checked by the release gate under policy credit-demo-v1. The evidence does not state a business purpose, so none is claimed here.

## What was released

- Pipeline: 2956970791, commit e0b230dc2687b442abc633b5f1abc2cbe6a54d0a
- Model file SHA-256: `9a0d961ee72dadec7978607bec96a8f57c139b67231388072d408bf825694282`
- Image: `registry.gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43241733/gasket/release:e0b230dc-d-p2956970791`, digest `sha256:6cbdb876bb248d7ff6245518d3b33f2156d58bde39720b84a942d1d34600cbb5`

## Data

- Evaluation data: `data/evaluation.csv`, SHA-256 `bb9fd32de35231837283918f10bb7030f41476c39a381cde46405fb0f3615998`
- The evaluation data is the fixed holdout; its hash is bound into the evidence, so a different file is a different release.

## Metrics against the policy

Policy `credit-demo-v1`, file SHA-256 `ae1fd5794425eb329c478489cd13ca7d74268abd303c9308008e01ed0d0325e3`.

| Measure | Value | Limit | Result |
|---|---|---|---|
| Accuracy | 0.7842 | at least 0.72 | within policy |
| Fairness gap (equal_opportunity_difference) | 0.1421 | at most 0.05 | not met or not recorded |

True-positive rate by group: group 0: 0.8468, group 1: 0.9888.

## Decision

The Witness decision was **blocked** with reason code(s) FAIRNESS_GAP_EXCEEDED.

## Signer and release

- Evidence signed: no or not recorded
- Signer identity: not recorded
- Verify: `not recorded`
- Approved by: @chandran.sivasurya
- Release job started by: not recorded

## Known limits

- The data is synthetic and the thresholds are this project's own demonstration rule, not a legal or regulatory standard.
- Fairness is measured with one metric (equal opportunity difference) between two groups; it says nothing about other groups or measures.
- The signature proves the evidence came from this pipeline and is unaltered. It does not assert that a person reviewed its correctness.
