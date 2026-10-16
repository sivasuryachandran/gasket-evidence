# Model card: release candidate-2956396432

Written from the evidence this pipeline recorded. Each value below is copied from the manifest, the Witness decision, the signature record or the deployment receipt; "not recorded" means the record does not say.

## Purpose

A model checked by the release gate under policy credit-demo-v1. The evidence does not state a business purpose, so none is claimed here.

## What was released

- Pipeline: 2956396432, commit a28d438f4e572aaf24e60ccd34978baf0974a65e
- Model file SHA-256: `516139218277ff82c55520812bdb469919d7ec45118600e690d6e69309087c29`
- Image: `registry.gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43241733/gasket/release:a28d438f-b-stale-p2956396432`, digest `sha256:169304b240706d8a336e5f4b4072fa5934389cead44c16263c47742d5150e7ae`

## Data

- Evaluation data: `data/evaluation.csv`, SHA-256 `bb9fd32de35231837283918f10bb7030f41476c39a381cde46405fb0f3615998`
- The evaluation data is the fixed holdout; its hash is bound into the evidence, so a different file is a different release.

## Metrics against the policy

Policy `credit-demo-v1`, file SHA-256 `ae1fd5794425eb329c478489cd13ca7d74268abd303c9308008e01ed0d0325e3`.

| Measure | Value | Limit | Result |
|---|---|---|---|
| Accuracy | 0.7425 | at least 0.72 | within policy |
| Fairness gap (equal_opportunity_difference) | 0.0085 | at most 0.05 | within policy |

True-positive rate by group: group 0: 0.8468, group 1: 0.8383.

## Decision

The Witness decision was **blocked** with reason code(s) MODEL_HASH_MISMATCH.

## Signer and release

- Evidence signed: no or not recorded
- Signer identity: not recorded
- Verify: `not recorded`
- Approved by: not recorded
- Release job started by: not recorded

## Known limits

- The data is synthetic and the thresholds are this project's own demonstration rule, not a legal or regulatory standard.
- Fairness is measured with one metric (equal opportunity difference) between two groups; it says nothing about other groups or measures.
- The signature proves the evidence came from this pipeline and is unaltered. It does not assert that a person reviewed its correctness.
