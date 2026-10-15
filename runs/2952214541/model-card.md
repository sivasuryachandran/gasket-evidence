# Model card: release candidate-2952214541

Written from the evidence this pipeline recorded. Each value below is copied from the manifest, the Witness decision, the signature record or the deployment receipt; "not recorded" means the record does not say.

## Purpose

A model checked by the release gate under policy credit-demo-v1. The evidence does not state a business purpose, so none is claimed here.

## What was released

- Pipeline: 2952214541, commit 46b712f6f256857d27afbeb7be9740b7c66ce5c2
- Model file SHA-256: `e0c256545cbde8964bf9674b9e36695ff32cbb06a3328490c96a9f79bc7a207d`
- Image: `registry.gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43241733/gasket/release:46b712f6-d-p2952214541`, digest `sha256:77668783283aefd278c68220847c52ae7bb6ec93b169dac201feae1ff85ebeec`

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

The Witness decision was **pass**.

## Signer and release

- Evidence signed: yes (https://search.sigstore.dev/?logIndex=3267185136)
- Signer identity: https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43241733/gasket//.gitlab-ci.yml@refs/heads/main
- Verify: `cosign verify-blob evidence_bundle.json --bundle evidence.cosign.bundle --certificate-identity "https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43241733/gasket//.gitlab-ci.yml@refs/heads/main" --certificate-oidc-issuer "https://gitlab.com"`
- Approved by: @chandran.sivasurya
- Release job started by: @chandran.sivasurya (the release is recorded only; no service was deployed)

## Known limits

- The data is synthetic and the thresholds are this project's own demonstration rule, not a legal or regulatory standard.
- Fairness is measured with one metric (equal opportunity difference) between two groups; it says nothing about other groups or measures.
- The signature proves the evidence came from this pipeline and is unaltered. It does not assert that a person reviewed its correctness.
- The deployment for this release is a labelled demonstration: a receipt was recorded and no service was deployed.
